import http from 'http';
import { AddressInfo } from 'ws';
import { createServer, Status, VERSION } from '../src';
import { sleep, withCustomServer, withServer } from './server.test-utils';

describe('Krmx Server', () => {
  it('should cycle through all server statuses when starting and closing', async () => {
    const server = createServer();
    expect(server.getStatus()).toStrictEqual<Status>('initializing');
    await new Promise<number>((resolve) => {
      server.on('listen', resolve);
      server.listen();
      expect(server.getStatus()).toStrictEqual<Status>('starting');
    });
    expect(server.getStatus()).toStrictEqual<Status>('listening');
    await new Promise<void>((resolve) => {
      server.on('close', resolve);
      server.close();
      expect(server.getStatus()).toStrictEqual<Status>('closing');
    });
    expect(server.getStatus()).toStrictEqual<Status>('closed');
  });

  it('should not be allowed to start listening on a server that is already listening',
    withServer(async ({ server }) => {
      expect(() => server.listen()).toThrow('cannot start listening when the server is listening');
    }),
  );

  it('should send messages to a custom logger if provided', async () => {
    const logger = jest.fn();
    const server = createServer({ logger });
    server.listen();
    await sleep();
    server.close();
    expect(logger).toHaveBeenCalledWith('info', expect.any(String));
  });

  it('should add metadata to messages when server has metadata enabled',
    withCustomServer({ metadata: true }, async({ server, addUser }) => {
      const simon = await addUser('simon');
      await sleep();
      for (let callIndex = 0; callIndex < simon.emit.message.mock.calls.length; callIndex++) {
        const call = simon.emit.message.mock.calls[callIndex];
        expect(call[0]).toHaveProperty('metadata', { timestamp: expect.any(String), isBroadcast: expect.any(Boolean) });
      }

      // broadcast
      simon.emit.message.mockClear();
      server.broadcast({ type: 'custom/message' });
      await sleep();
      expect(simon.emit.message).toHaveBeenCalledWith({ type: 'custom/message', metadata: { timestamp: expect.any(String), isBroadcast: true } });
      expect(simon.emit.message).toHaveBeenCalledTimes(1);

      // send
      simon.emit.message.mockClear();
      server.send('simon', { type: 'custom/message' });
      await sleep();
      expect(simon.emit.message).toHaveBeenCalledWith({ type: 'custom/message', metadata: { timestamp: expect.any(String), isBroadcast: false } });
      expect(simon.emit.message).toHaveBeenCalledTimes(1);
    }),
  );

  it('should not be allowed to close a server that is not running', async () => {
    const server = createServer();
    expect(() => server.close()).toThrow('cannot close when the server is initializing');
    server.listen();
    await sleep();
    server.close();
    await sleep();
    expect(() => server.close()).toThrow('cannot close when the server is closed');
  });

  it('should emit a listen event with the port once the server successfully started listening',
    withServer(async ({ serverEmit }) => {
      expect(serverEmit.listen).toHaveBeenCalledWith(expect.any(Number));
    }),
  );

  it('should accept a user with a valid link message',
    withServer(async ({ serverEmit, addUser }) => {
      const simon = await addUser('simon');
      await sleep();
      expect(simon.emit.message).toHaveBeenCalledWith({ type: 'krmx/accepted' });
      expect(serverEmit.authenticate).toHaveBeenCalledWith('simon', true, expect.any(Function));
      expect(serverEmit.join).toHaveBeenCalledWith('simon');
      expect(serverEmit.link).toHaveBeenCalledWith('simon');
    }),
  );

  it('should not accept a user with minor or major version mismatch in the link message',
    withServer(async ({ addUser }) => {
      const user = await addUser();
      const fakeVersion = `1${VERSION}`;
      user.send({ type: 'krmx/link', payload: { username: 'simon', version: fakeVersion } });
      await sleep();
      const serverVersionWithoutPatch = VERSION.substring(0, VERSION.lastIndexOf('.'));
      expect(user.emit.message).toHaveBeenCalledWith({ type: 'krmx/rejected', payload: {
        reason: `krmx server version mismatch (server=${serverVersionWithoutPatch}.*,client=${fakeVersion})`,
      } });
    }),
  );

  it('should accept a user with a patch mismatch in the link message',
    withServer(async ({ addUser }) => {
      const user = await addUser();
      const fakeVersion = `${VERSION}1`;
      user.send({ type: 'krmx/link', payload: { username: 'simon', version: fakeVersion } });
      await sleep();
      expect(user.emit.message).toHaveBeenCalledWith({ type: 'krmx/accepted' });
    }),
  );

  it('should reject authentication when an invalid link message is received',
    withServer(async ({ addUser, scenario }) => {
      const user = await addUser();
      user.send(scenario.value);
      await sleep();
      expect(user.emit.message).toHaveBeenCalledWith({ type: 'krmx/rejected', payload: { reason: 'invalid link request' } });
      expect(user.emit.close).not.toHaveBeenCalled();
    }, [
      { type: 'krmx/link', payload: { version: 'abc', username: 11 } },
      { type: 'krmx/link', payload: { version: 'def', missing: 'incorrect' } },
      { type: 'krmx/link', payload: { version: 11, username: 'simon' } },
      { type: 'krmx/link', payload: { missing: 'incorrect', username: 'simon' } },
      { type: 'krmx/link', payload: { version: 11, username: 11 } },
      { type: 'krmx/link', payload: 3 },
      { type: 'krmx/link' },
    ]),
  );

  it('should unlink a connection when it sends a link message while already linked to a user',
    withServer(async ({ serverEmit, addUser }) => {
      const simon = await addUser('simon');
      const linkMessage = { type: 'krmx/link', payload: { username: 'simon', version: VERSION } };
      simon.send(linkMessage);
      await sleep();
      expect(serverEmit.unlink).toHaveBeenCalledWith('simon');
      expect(simon.emit.message).toHaveBeenCalledWith({ type: 'krmx/unlinked', payload: { username: 'simon' } });
      expect(simon.emit.close).not.toHaveBeenCalled();
    }),
  );

  it('should not emit events when a connection connects and closes before linking',
    withServer(async ({ serverEmit, addUser }) => {
      const user = await addUser();
      user.send({ type: 'something' });
      user.close();
      await sleep();
      expect(serverEmit.join).not.toHaveBeenCalled();
      expect(serverEmit.link).not.toHaveBeenCalled();
      expect(serverEmit.unlink).not.toHaveBeenCalled();
      expect(serverEmit.leave).not.toHaveBeenCalled();
    }),
  );

  it('should reject when any custom message is sent before linking',
    withServer(async ({ addUser, serverEmit }) => {
      const user = await addUser();
      user.send({ type: 'custom/something' });
      await sleep();
      expect(user.emit.message).toHaveBeenCalledWith({
        type: 'krmx/rejected',
        payload: { reason: 'unlinked connection' },
      });
      expect(user.emit.close).not.toHaveBeenCalled();
      expect(serverEmit.message).not.toHaveBeenCalled();
    }),
  );

  it('should reject a user linking with a username that is already linked to a connection',
    withServer(async ({ addUser }) => {
      await addUser('simon');
      await addUser('lisa');
      await expect(addUser('simon')).rejects.toStrictEqual('user simon is already linked to a connection');
    }),
  );

  const invalidJsonMessages = ['', 'true', '"hello"', '42', 'null', 'this-is-not-a-json-message', '{}', '{"type":3}', '{"type":{"key":"value"}}'];
  it('should send a rejected message if a connection sends a message with unknown format',
    withServer(async({ addUser, scenario }) => {
      const user = await addUser();
      user.sendRaw(scenario.value);
      await sleep();
      expect(user.emit.message).toHaveBeenCalledWith({
        type: 'krmx/rejected',
        payload: { reason: 'invalid message' },
      });
      expect(user.emit.close).not.toHaveBeenCalled();
    }, invalidJsonMessages),
  );

  it('should unlink a connection from its user if a message with unknown format is send',
    withServer(async({ serverEmit, addUser, scenario }) => {
      const username = `simon${scenario.index}`;
      const user = await addUser(username);
      user.sendRaw(scenario.value);
      await sleep();
      expect(user.emit.message).toHaveBeenCalledWith({ type: 'krmx/unlinked', payload: { username } });
      expect(user.emit.close).not.toHaveBeenCalled();
      expect(serverEmit.unlink).toHaveBeenCalledWith(username);
    }, invalidJsonMessages),
  );

  it('should unlink a user if it sends a message starting with krmx/ that is not a link, unlink, or leave message',
    withServer(async({ serverEmit, addUser, scenario }) => {
      const username = `simon${scenario.index}`;
      const user = await addUser(username);
      user.send(scenario.value);
      await sleep();
      expect(serverEmit.unlink).toHaveBeenCalledWith(username);
    }, [
      { type: 'krmx/accepted' },
      { type: 'krmx/rejected' },
      { type: 'krmx/joined' },
      { type: 'krmx/linked' },
      { type: 'krmx/unlinked' },
      { type: 'krmx/left' },
      { type: 'krmx/custom' },
      { type: 'krmx/' },
    ]),
  );

  it('should allow a user to link using a new connection after the connection was lost',
    withServer(async({ addUser }) => {
      const simon = await addUser('simon');
      await sleep();
      simon.close();
      await sleep();
      await addUser('simon');
    }),
  );

  it('should emit the message and username if a custom message is received from a linked connection',
    withServer(async({ serverEmit, addUser }) => {
      const simon = await addUser('simon');
      const customMessage = { type: 'custom', payload: { key: 'value' } };
      simon.send(customMessage);
      await sleep();
      expect(serverEmit.message).toHaveBeenCalledWith('simon', customMessage);
    }),
  );

  it('should inform all users when a user joins',
    withServer(async({ addUser }) => {
      const simon = await addUser('simon');
      await addUser('lisa');
      await sleep();
      expect(simon.emit.message).toHaveBeenCalledWith({
        type: 'krmx/joined',
        payload: { username: 'lisa' },
      });
      expect(simon.emit.message).toHaveBeenLastCalledWith({
        type: 'krmx/linked',
        payload: { username: 'lisa' },
      });
    }),
  );

  it('should send information about all users to a new user',
    withServer(async({ server, addUser }) => {
      await addUser('simon');
      const lisa = await addUser('lisa');
      await sleep();
      lisa.close();
      await sleep();
      const marjolein = await addUser('marjolein');
      await sleep();
      expect(marjolein.emit.message).toHaveBeenNthCalledWith(1, {
        type: 'krmx/accepted',
      });
      expect(marjolein.emit.message).toHaveBeenCalledWith({
        type: 'krmx/joined',
        payload: { username: 'marjolein' },
      });
      expect(marjolein.emit.message).toHaveBeenCalledWith({
        type: 'krmx/linked',
        payload: { username: 'marjolein' },
      });
      expect(marjolein.emit.message).toHaveBeenCalledWith({
        type: 'krmx/joined',
        payload: { username: 'simon' },
      });
      expect(marjolein.emit.message).toHaveBeenCalledWith({
        type: 'krmx/linked',
        payload: { username: 'simon' },
      });
      expect(marjolein.emit.message).toHaveBeenCalledWith({
        type: 'krmx/joined',
        payload: { username: 'lisa' },
      });
      expect(marjolein.emit.message).toHaveBeenCalledTimes(6);
      expect(server.getUsers()).toStrictEqual([
        { username: 'simon', isLinked: true },
        { username: 'lisa', isLinked: false },
        { username: 'marjolein', isLinked: true },
      ]);
    }),
  );

  it(
    'should let a user leave the server and should inform other users about the leave',
    withServer(async({ server, serverEmit, addUser }) => {
      const simon = await addUser('simon');
      const lisa = await addUser('lisa');
      await sleep();
      lisa.send({ type: 'krmx/leave' });
      await sleep();
      expect(simon.emit.message).toHaveBeenCalledWith({
        type: 'krmx/unlinked', payload: { username: 'lisa' },
      });
      expect(simon.emit.message).toHaveBeenLastCalledWith({
        type: 'krmx/left', payload: { username: 'lisa' },
      });
      expect(serverEmit.leave).toHaveBeenCalledWith('lisa');
      expect(lisa.emit.close).not.toBeCalled();
      expect(lisa.emit.message).toHaveBeenLastCalledWith({
        type: 'krmx/left', payload: { username: 'lisa' },
      });
      expect(server.getUsers()).toStrictEqual([
        { username: 'simon', isLinked: true },
      ]);
    }),
  );

  it('should inform all users when a user is unlinked from a connection',
    withServer(async({ server, serverEmit, addUser }) => {
      const simon = await addUser('simon');
      const lisa = await addUser('lisa');
      await sleep();
      server.unlink('lisa');
      await sleep();
      expect(serverEmit.unlink).toHaveBeenCalledWith('lisa');
      expect(simon.emit.message).toHaveBeenCalledWith({
        type: 'krmx/unlinked',
        payload: { username: 'lisa' },
      });
      expect(lisa.emit.message).toHaveBeenCalledWith({
        type: 'krmx/unlinked',
        payload: { username: 'lisa' },
      });
      expect(server.getUsers()).toStrictEqual([
        { username: 'simon', isLinked: true },
        { username: 'lisa', isLinked: false },
      ]);
    }),
  );

  it('should inform all users when a user is linked to a connection',
    withServer(async({ serverEmit, addUser }) => {
      const simon = await addUser('simon');
      const lisa = await addUser('lisa');
      await sleep();
      lisa.close();
      await sleep();
      simon.emit.message.mockReset();
      serverEmit.link.mockReset();
      await addUser('lisa');
      await sleep();
      expect(serverEmit.link).toHaveBeenCalledWith('lisa');
      expect(simon.emit.message).toHaveBeenCalledWith({
        type: 'krmx/linked',
        payload: { username: 'lisa' },
      });
      expect(simon.emit.message).not.toHaveBeenCalledWith({
        type: 'krmx/joined',
        payload: { username: 'lisa' },
      });
    }),
  );

  it('should throw when server methods are called while the server is initializing', async () => {
    const server = createServer();
    expect(() => server.send('simon', { type: 'custom/hello' }))
      .toThrow('cannot send a message when the server is initializing');
    expect(() => server.broadcast({ type: 'custom/hello' }))
      .toThrow('cannot broadcast a message when the server is initializing');
    expect(() => server.kick('simon'))
      .toThrow('cannot kick a user when the server is initializing');
    expect(() => server.unlink('simon'))
      .toThrow('cannot unlink a connection from a user when the server is initializing');
    expect(() => server.join('simon'))
      .toThrow('cannot join a user when the server is initializing');
  });

  it('should not allow sending a message to a user that does not exist',
    withServer(async ({ server }) => {
      expect(() => server.send('simon', { type: 'custom/hello' }))
        .toThrow('cannot send a message to a user that does not exist');
    }),
  );

  it('should not allow sending a message to a user that is not linked',
    withServer(async ({ server, addUser }) => {
      const simon = await addUser('simon');
      simon.close();
      await sleep();
      expect(() => server.send('simon', { type: 'custom/hello' }))
        .toThrow('cannot send a message to a user that is not linked to a connection');
    }),
  );

  it('should allow sending a message to a user',
    withServer(async ({ server, addUser }) => {
      const simon = await addUser('simon');
      const customMessage = { type: 'custom/hello' };
      server.send('simon', customMessage);
      await sleep();
      expect(simon.emit.message).toHaveBeenCalledWith(customMessage);
    }),
  );

  it('should allow broadcasting a message to all linked users',
    withServer(async ({ server, addUser }) => {
      const simon = await addUser('simon');
      const lisa = await addUser('lisa');
      const marjolein = await addUser('marjolein');
      lisa.close();
      await sleep();
      const customMessage = { type: 'custom/hello' };
      server.broadcast(customMessage);
      await sleep();
      expect(simon.emit.message).toHaveBeenCalledWith(customMessage);
      expect(marjolein.emit.message).toHaveBeenCalledWith(customMessage);
    }),
  );

  (['send', 'broadcast'] as const).forEach(methodName => {
    it(`should allow ${methodName}ing a message to a newly joined user in the link event, but not in the join event`,
      withServer(async ({ server, addUser }) => {
        server.on('join', (username: string) => {
          if (methodName === 'send') {
            server.send(username, { type: 'custom/welcome-on-join' });
          } else {
            server.broadcast({ type: 'custom/welcome-on-join' });
          }
        });
        server.on('link', (username: string) => {
          if (methodName === 'send') {
            server.send(username, { type: 'custom/welcome-on-link' });
          } else {
            server.broadcast({ type: 'custom/welcome-on-link' });
          }
        });
        const simon = await addUser('simon');
        await sleep();
        expect(simon.emit.message).not.toHaveBeenCalledWith({ type: 'custom/welcome-on-join' });
        expect(simon.emit.message).toHaveBeenLastCalledWith({ type: 'custom/welcome-on-link' });
      }),
    );
  });

  it('should skip broadcasting to a the user with the username equal to skipUsername',
    withServer(async ({ server, addUser }) => {
      const simon = await addUser('simon');
      const lisa = await addUser('lisa');
      await sleep();
      server.broadcast({ type: 'custom/hello' }, 'simon');
      await sleep();
      expect(simon.emit.message).not.toHaveBeenCalledWith({ type: 'custom/hello' });
      expect(lisa.emit.message).toHaveBeenCalledWith({ type: 'custom/hello' });
    }),
  );

  it('should allow a connection to link after it was rejected before',
    withServer(async ({ server, addUser }) => {
      await addUser('simon');
      const user = await addUser();
      await sleep();
      user.send({ type: 'krmx/link', payload: { username: 'simon', version: VERSION } });
      await sleep();
      expect(user.emit.message).toHaveBeenCalledWith({
        type: 'krmx/rejected', payload: { reason: 'user simon is already linked to a connection' },
      });
      user.send({ type: 'krmx/link', payload: { username: 'lisa', version: VERSION } });
      await sleep();
      expect(user.emit.message).toHaveBeenCalledWith({ type: 'krmx/accepted' });
    }),
  );

  it('should reject linking a connection to a user, if the reject callback in the authenticate event is called with a reason',
    withServer(async ({ server, serverEmit, addUser }) => {
      server.on('authenticate', (username: string, isNewUser: boolean, reject: (reason: string) => void) => {
        if (!isNewUser) {
          reject('relinking is not allowed here');
        } else if (server.getUsers().length >= 1) {
          reject('server is full');
          reject('this should not show up');
        }
      });
      const simon = await addUser('simon');
      simon.close();
      await sleep();
      await expect(addUser('simon')).rejects.toBe('relinking is not allowed here');
      await expect(addUser('lisa')).rejects.toBe('server is full');
      expect(serverEmit.authenticate).toHaveBeenCalledTimes(3);
      expect(serverEmit.join).toHaveBeenCalledTimes(1);
    }),
  );

  it('should be able to kick a linked user from the server',
    withServer(async ({ server, serverEmit, addUser }) => {
      const simon = await addUser('simon');
      const lisa = await addUser('lisa');
      server.kick('simon');
      await sleep();
      const userUnlinkedMessage = { type: 'krmx/unlinked', payload: { username: 'simon' } };
      const userLeftMessage = { type: 'krmx/left', payload: { username: 'simon' } };
      expect(simon.emit.message).toHaveBeenCalledWith(userUnlinkedMessage);
      expect(simon.emit.message).toHaveBeenCalledWith(userLeftMessage);
      expect(simon.emit.close).not.toHaveBeenCalled();
      expect(lisa.emit.message).toHaveBeenCalledWith(userUnlinkedMessage);
      expect(lisa.emit.message).toHaveBeenCalledWith(userLeftMessage);
      expect(serverEmit.leave).toHaveBeenCalledWith('simon');
      expect(server.getUsers()).toStrictEqual([
        { username: 'lisa', isLinked: true },
      ]);
    }),
  );

  it('should be able to kick an unlinked user from the server',
    withServer(async ({ server, serverEmit, addUser }) => {
      const simon = await addUser('simon');
      simon.close();
      await sleep();
      serverEmit.unlink.mockReset();
      server.kick('simon');
      await sleep();
      expect(serverEmit.unlink).not.toHaveBeenCalled();
      expect(serverEmit.leave).toHaveBeenCalledWith('simon');
      expect(server.getUsers()).toStrictEqual([]);
    }),
  );

  it('should not allow kicking a user, if that user does not exist',
    withServer(async ({ server }) => {
      expect(() => server.kick('simon')).toThrow('cannot kick a user that does not exist');
    }),
  );

  it('should not allow server side join on a user that already exists',
    withServer(async ({ server }) => {
      server.join('simon');
      expect(() => server.join('simon')).toThrow('cannot join a user that already exist');
    }),
  );

  it('should not allow server side unlink on a user that does not exist',
    withServer(async ({ server }) => {
      expect(() => server.unlink('simon')).toThrow('cannot unlink a connection from a user that does not exist');
    }),
  );

  it('should not allow server side unlink on a user that is not linked',
    withServer(async ({ server, addUser }) => {
      const simon = await addUser('simon');
      simon.close();
      await sleep();
      expect(() => server.unlink('simon')).toThrow('cannot unlink a connection from a user that is not linked');
    }),
  );

  it('should only accept known users during authentication when server has acceptNewUser set to false',
    withCustomServer({ acceptNewUsers: false }, async ({ server, addUser }) => {
      server.join('simon');
      await addUser('simon');
      await expect(addUser('lisa')).rejects.toBe('server is not accepting new users');
    }),
  );

  it('should not join user with an invalid username when a custom invalid username method is provided',
    withCustomServer({ isValidUsername: (username: string) => !username.startsWith('bot') }, async ({ server, addUser }) => {
      await addUser('simon');
      server.join('lisa');
      await expect(addUser('bot 1')).rejects.toBe('invalid username');
      expect(() => server.join('bot 2')).toThrow('invalid username');
    }),
  );

  it('should use existing http server when provided',
    withCustomServer({ http: { server: new http.Server() } }, async ({ server, addUser }) => {
      await addUser('simon');
    }),
  );

  it('should use existing http server, even if that http server is already listening', async () => {
    const httpServer = new http.Server();
    httpServer.listen();
    await sleep();
    await withCustomServer({ http: { server: httpServer } }, async ({ addUser }) => {
      await addUser('simon');
    })();
  });

  it('should use existing http server, even if that http server just started listening', async () => {
    const httpServer = new http.Server();
    httpServer.listen();
    await withCustomServer({ http: { server: httpServer } }, async ({ addUser }) => {
      await addUser('simon');
    })();
  });

  it('should use custom http path when provided',
    withCustomServer({ http: { path: '/my/application' } }, async ({ addUser }) => {
      await addUser('simon');
    }),
  );

  it('should use custom http path when provided even without a starting slash',
    withCustomServer({ http: { path: 'my/application' } }, async ({ addUser }) => {
      await addUser('simon');
    }),
  );

  it('should close a connection immediately when the query parameter do not match',
    withCustomServer({ http: { queryParams: { 'something-else': true } } }, async ({ addUser }) => {
      await expect(addUser('simon')).rejects.toBe('connection closed');
    }),
  );

  it('should call listen on server even when provided http server is already listening', async () => {
    const httpServer = new http.Server();
    httpServer.listen();
    try {
      await sleep();
      const server = createServer({ http: { server: httpServer } });
      expect(() => server.join('simon')).toThrow('cannot join a user when the server is initializing');
      const httpServerPort = (httpServer.address() as AddressInfo).port;
      expect(() => server.listen(httpServerPort + 1))
        .toThrow(`cannot start listening on port ${httpServerPort + 1} as the underlying http server is already listening on port ${httpServerPort}`);
      await new Promise<number>((resolve) => {
        server.on('listen', resolve);
        server.listen();
      });
      expect(() => server.join('simon')).not.toThrow();
    } finally {
      await new Promise<void>((resolve) => {
        httpServer.on('close', resolve);
        httpServer.close();
      });
    }
  });
});
