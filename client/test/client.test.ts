import { User } from '@krmx/base';
import { createServer } from '@krmx/server';
import { createClient, Status, Events } from '../src';

const sleep = (ms = 20) => new Promise<void>((resolve) => setTimeout(resolve, ms));

describe('createClient', () => {
  it('should be able to connect and link to and unlink from a user and disconnect from a Krmx server', async () => {
    const server = createServer();
    server.on('authenticate', (username, info, reject) => {
      if (info.auth !== 'secret') {
        reject('authentication failed');
      }
    });
    try {
      const portNumber = await new Promise<number>((resolve) => {
        server.on('listen', resolve);
        server.listen();
      });
      const client = createClient();
      expect(client.getStatus()).toBe('initializing');
      expect(client.getUsername()).toBe(undefined);
      expect(client.getUsers().length).toBe(0);
      await expect(client.connect(`ws://localhost:${portNumber - 1}`)).rejects
        .toThrow(`error while trying to connect to the server at ws://localhost:${portNumber - 1}`);
      await client.connect(`ws://localhost:${portNumber}`);
      expect(client.getStatus()).toBe('connected');
      expect(() => client.send({ type: 'custom/message', payload: 'Hello, world!' }))
        .toThrow('cannot send when the client is connected');
      await expect(client.link('a', 'secret')).rejects
        .toThrow('invalid username');
      await expect(client.link('simon', 'not-secret')).rejects
        .toThrow('authentication failed');
      expect(client.getUsername()).toBe(undefined);
      await client.link('simon', 'secret');
      expect(client.getStatus()).toBe('linked');
      expect(client.getUsername()).toBe('simon');
      expect(client.getUsers()).toStrictEqual([{ username: 'simon', isLinked: true }]);
      await new Promise<void>((resolve, reject) => {
        let messageReceivedInAll = false;
        server.on('message', (username, message) => {
          if (
            username === 'simon' &&
            message.type === 'custom/message' &&
            'payload' in message &&
            message.payload === 'Hello, universe!'
          ) {
            if (messageReceivedInAll) {
              resolve();
            } else {
              reject('message not received in all first');
            }
          } else {
            reject('invalid message received');
          }
        });
        server.all((on, username, message) => {
          if (
            on === 'message' &&
            username === 'simon' &&
            typeof message === 'object' &&
            message !== null &&
            'payload' in message &&
            message.payload === 'Hello, universe!'
          ) {
            messageReceivedInAll = true;
          }
        });
        client.send({ type: 'custom/message', payload: 'Hello, universe!' });
      });
      expect(() => client.send({ type: 'krmx/invalid' }))
        .toThrow('cannot send custom messages with type starting with the internal \'krmx/\' prefix');
      await new Promise<void>((resolve, reject) => {
        let messageReceivedInAll = false;
        client.on('message', (message) => {
          if (message.type === 'custom/server-message') {
            if (messageReceivedInAll) {
              resolve();
            } else {
              reject('message not received in all first');
            }
          } else {
            reject('unexpected message from the server');
          }
        });
        client.all((on, message) => {
          if (on === 'message' && typeof message === 'object' && message !== null && 'type' in message && message.type === 'custom/server-message') {
            messageReceivedInAll = true;
          }
        });
        server.send('simon', { type: 'custom/server-message' });
      });
      await expect(client.link('lisa', 'secret')).rejects
        .toThrow('cannot link when the client is linked');
      await client.unlink();
      expect(client.getUsers().length).toBe(0);
      await client.link('lisa', 'secret');
      expect(client.getUsers()).toStrictEqual([{ username: 'lisa', isLinked: true }, { username: 'simon', isLinked: false }]);
      await client.leave();
      expect(client.getUsers().length).toBe(0);
      expect(client.getStatus()).toBe('connected');
      await client.link('simon', 'secret');
      expect(client.getUsers()).toStrictEqual([{ username: 'simon', isLinked: true }]);
      await expect(client.disconnect()).rejects
        .toThrow('cannot disconnect when the client is linked');
      await client.unlink();
      expect(client.getUsername()).toBe(undefined);
      expect(client.getStatus()).toBe('connected');
      expect(client.getUsers().length).toBe(0);
      await client.disconnect();
      expect(client.getStatus()).toBe('closed');
    } finally {
      await new Promise<void>((resolve) => {
        server.on('close', resolve);
        server.close();
      });
    }
  });

  it('should show when other clients are joining, linking, unlinking, and leaving', async () => {
    const server = createServer();
    const portNumber = await new Promise<number>((resolve) => {
      server.on('listen', resolve);
      server.listen();
    });
    const simon = createClient();
    await simon.connect(`ws://localhost:${portNumber}`);
    await simon.link('simon');

    expect(simon.getUsers().length).toStrictEqual(1);
    expect(simon.getUsers()).toContainEqual({ username: 'simon', isLinked: true });

    // Another client is connected
    const otherClient = createClient();
    await otherClient.connect(`ws://localhost:${portNumber}`);
    expect(simon.getUsers().length).toStrictEqual(1);
    expect(simon.getUsers()).toContainEqual({ username: 'simon', isLinked: true });

    // Another client is linked as lisa
    await otherClient.link('lisa');
    await sleep();
    expect(simon.getUsers().length).toStrictEqual(2);
    expect(simon.getUsers()).toContainEqual({ username: 'lisa', isLinked: true });

    // Lisa has unlinked (but did not leave)
    await otherClient.unlink();
    await sleep();
    expect(simon.getUsers().length).toStrictEqual(2);
    expect(simon.getUsers()).toContainEqual({ username: 'lisa', isLinked: false });

    // Marjolein links
    await otherClient.link('marjolein');
    await sleep();
    expect(simon.getUsers().length).toStrictEqual(3);
    expect(simon.getUsers()).toContainEqual({ username: 'lisa', isLinked: false });
    expect(simon.getUsers()).toContainEqual({ username: 'marjolein', isLinked: true });

    // Marjolein leaves
    await otherClient.leave();
    await sleep();
    expect(simon.getUsers().length).toStrictEqual(2);
    expect(simon.getUsers()).toContainEqual({ username: 'simon', isLinked: true });
    expect(simon.getUsers()).toContainEqual({ username: 'lisa', isLinked: false });

    // Cleanup
    await otherClient.disconnect();
    await simon.disconnect(true);
    await new Promise<void>((resolve) => {
      server.on('close', resolve);
      server.close();
    });
    expect(simon.getUsers().length).toBe(0);
  });

  it('should be able to receive another client if that client joined and unlinked while the client was unlinked', async () => {
    const server = createServer();
    const portNumber = await server.listen();

    // Join and disconnect Simon
    const simon = createClient();
    await simon.connect(`ws://localhost:${portNumber}`);
    await simon.link('simon');
    await simon.disconnect(true);
    await sleep();
    expect(server.getUsers()).toContainEqual<User>({ username: 'simon', isLinked: false });

    // Join Lisa (showing a disconnected Simon)
    const lisa = createClient();
    await lisa.connect(`ws://localhost:${portNumber}`);
    await lisa.link('lisa');
    await sleep();
    expect(lisa.getUsers()).toContainEqual<User>({ username: 'simon', isLinked: false });
    expect(lisa.getUsers()).toContainEqual<User>({ username: 'lisa', isLinked: true });
    expect(server.getUsers()).toContainEqual<User>({ username: 'simon', isLinked: false });
    expect(server.getUsers()).toContainEqual<User>({ username: 'lisa', isLinked: true });

    // Disconnect Lisa
    await lisa.disconnect(true);
    await sleep();
    expect(server.getUsers()).toContainEqual<User>({ username: 'simon', isLinked: false });
    expect(server.getUsers()).toContainEqual<User>({ username: 'lisa', isLinked: false });

    // Connect Simon and verify that Lisa is shown as unlinked
    await simon.connect(`ws://localhost:${portNumber}`);
    await simon.link('simon');
    await sleep();
    expect(server.getUsers()).toContainEqual<User>({ username: 'simon', isLinked: true });
    expect(server.getUsers()).toContainEqual<User>({ username: 'lisa', isLinked: false });
    expect(simon.getUsers()).toContainEqual<User>({ username: 'simon', isLinked: true });
    expect(simon.getUsers()).toContainEqual<User>({ username: 'lisa', isLinked: false });

    // Server side join Rik and verify Rik is shown to Simon
    const joinPromise = new Promise<string>((resolve) => simon.once('join', resolve));
    server.join('rik');
    await sleep();
    expect(simon.getUsers()).toContainEqual<User>({ username: 'rik', isLinked: false });
    const joiner = await joinPromise;
    expect(joiner).toBe('rik');

    // Disconnect all
    await simon.disconnect(true);
    await server.close();
  });

  it('should be able to retrieve a message once', async () => {
    const server = createServer();
    const portNumber = await new Promise<number>((resolve) => {
      server.on('listen', resolve);
      server.listen();
    });
    const client = createClient();
    await client.connect(`ws://localhost:${portNumber}`);
    await client.link('simon');
    let count = 0;
    await new Promise<void>((resolve, reject) => {
      client.once('message', (message) => {
        if (message.type === 'custom/once') {
          count += 1;
          resolve();
        } else {
          reject('unexpected message from the server');
        }
      });
      server.send('simon', { type: 'custom/once' });
      server.send('simon', { type: 'custom/once' });
    });
    await sleep();
    expect(count).toBe(1);

    await client.disconnect(true);
    await server.close();
  });

  it('verify all events are emitted by the client', async () => {
    type State = [Status, string | undefined, User[], ...unknown[]];
    const server = createServer();
    const client = createClient();
    const portNumber = await server.listen();
    const capture = (eventName: keyof Events) => new Promise((resolve: (state: State) => void) => client.once(eventName, (...args) => {
      resolve([client.getStatus(), client.getUsername(), client.getUsers(), ...args]);
    }));

    // Capture all
    const connectingCapture = capture('connecting');
    const connectCapture = capture('connect');
    const closeCapture = capture('close');
    const closingCapture = capture('closing');
    const acceptCapture = capture('accept');
    const rejectCapture = capture('reject');
    const joinCapture = capture('join');
    const linkCapture = capture('link');
    const linkingCapture = capture('linking');
    const unlinkCapture = capture('unlink');
    const unlinkingCapture = capture('unlinking');
    const leaveCapture = capture('leave');
    const messageCapture = capture('message');

    // Run through all logic
    await client.connect(`ws://localhost:${portNumber}`);
    try { await client.link('inv#lid'); } catch (e) { /* ignore */ }
    await client.link('simon');
    server.join('lisa');
    server.send('simon', { type: 'custom/message', payload: 'Hello, world!' });
    await sleep();
    server.kick('lisa');
    await sleep();
    await client.unlink();
    await client.disconnect();

    // Wait for captures
    const [
      connecting,
      connect,
      close,
      closing,
      accept,
      reject,
      join,
      link,
      linking,
      unlink,
      unlinking,
      leave,
      message,
    ] = await Promise.all([
      connectingCapture,
      connectCapture,
      closeCapture,
      closingCapture,
      acceptCapture,
      rejectCapture,
      joinCapture,
      linkCapture,
      linkingCapture,
      unlinkCapture,
      unlinkingCapture,
      leaveCapture,
      messageCapture,
    ]);

    // Verify captures
    expect(connecting).toStrictEqual(['connecting', undefined, []]);
    expect(connect).toStrictEqual(['connected', undefined, []]);
    expect(close).toStrictEqual(['closed', undefined, []]);
    expect(closing).toStrictEqual(['closing', undefined, []]);
    expect(accept).toStrictEqual(['linked', 'simon', [{ username: 'simon', isLinked: true }]]);
    expect(reject).toStrictEqual(['connected', undefined, [], 'invalid username']);
    expect(join).toStrictEqual(['linked', 'simon', [{ username: 'simon', isLinked: true }], 'simon']);
    expect(link).toStrictEqual(['linked', 'simon', [{ username: 'simon', isLinked: true }], 'simon']);
    expect(linking).toStrictEqual(['linking', 'inv#lid', []]);
    expect(unlink).toStrictEqual(['connected', 'simon', [], 'simon']);
    expect(unlinking).toStrictEqual(['unlinking', 'simon', [{ username: 'simon', isLinked: true }]]);
    expect(leave).toStrictEqual(['linked', 'simon', [{ username: 'simon', isLinked: true }], 'lisa']);
    expect(message).toStrictEqual(['linked', 'simon', [{ username: 'simon', isLinked: true }, { username: 'lisa', isLinked: false }],
      { type: 'custom/message', payload: 'Hello, world!' }]);

    // Clean up
    await server.close();
  });
  it('should respond with pong messages when a server sends a ping', async () => {
    const server = createServer({ pingIntervalMilliseconds: 500 });
    const portNumber = await server.listen();

    const simon = createClient();
    await simon.connect(`ws://localhost:${portNumber}`);
    await simon.link('simon');
    await sleep(750);

    await simon.disconnect(true);
    await server.close();
  });

  // TODO: Verify all events are emitted by the client
  // TODO: Test for non-Krmx WebSocket server
  // TODO: Test for version mismatch with Krmx server
  // TODO: Test for when connection is lost
});
