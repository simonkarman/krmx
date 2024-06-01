import { createServer } from '@krmx/server';
import { createClient } from '../src';

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

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
        server.on('message', (username, message) => {
          if (
            username === 'simon' &&
            message.type === 'custom/message' &&
            'payload' in message &&
            message.payload === 'Hello, universe!'
          ) {
            resolve();
          } else {
            reject('invalid message received');
          }
        });
        client.send({ type: 'custom/message', payload: 'Hello, universe!' });
      });
      expect(() => client.send({ type: 'krmx/invalid' }))
        .toThrow('cannot send custom messages with type starting with the internal \'krmx/\' prefix');
      await new Promise<void>((resolve, reject) => {
        client.on('message', (message) => {
          if (message.type === 'custom/server-message') {
            resolve();
          } else {
            reject('unexpected message from the server');
          }
        });
        server.send('simon', { type: 'custom/server-message' });
      });
      await expect(client.link('lisa', 'secret')).rejects
        .toThrow('cannot link when the client is linked');
      await client.unlink();
      expect(client.getUsers().length).toBe(0);
      await client.link('lisa', 'secret');
      expect(client.getUsers()).toStrictEqual([{ username: 'simon', isLinked: false }, { username: 'lisa', isLinked: true }]);
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
    await sleep(20);
    expect(simon.getUsers().length).toStrictEqual(2);
    expect(simon.getUsers()).toContainEqual({ username: 'lisa', isLinked: true });

    // Lisa has unlinked (but did not leave)
    await otherClient.unlink();
    await sleep(20);
    expect(simon.getUsers().length).toStrictEqual(2);
    expect(simon.getUsers()).toContainEqual({ username: 'lisa', isLinked: false });

    // Marjolein links
    await otherClient.link('marjolein');
    await sleep(20);
    expect(simon.getUsers().length).toStrictEqual(3);
    expect(simon.getUsers()).toContainEqual({ username: 'lisa', isLinked: false });
    expect(simon.getUsers()).toContainEqual({ username: 'marjolein', isLinked: true });

    // Marjolein leaves
    await otherClient.leave();
    await sleep(20);
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

  // TODO: Test for non-Krmx WebSocket server
  // TODO: Test for version mismatch with Krmx server
  // TODO: Test for when connection is lost
});
