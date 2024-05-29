import { createClient } from '../src';

describe('createClient', () => {
  it('should be able to connect and link to and unlink from a user and disconnect from a Krmx server', async () => {
    const portNumber = 8082; // TODO: start server!
    const client = createClient();
    expect(client.getStatus()).toBe('initializing');
    await expect(client.connect(`ws://localhost:${portNumber - 1}`)).rejects
      .toThrow(`error while trying to connect to the server at ws://localhost:${portNumber - 1}`);
    await client.connect(`ws://localhost:${portNumber}`);
    expect(client.getStatus()).toBe('connected');
    expect(() => client.send({ type: 'custom/message', payload: 'Hello, world!' }))
      .toThrow('cannot send when the client is connected');
    await expect(client.link('a')).rejects
      .toThrow('invalid username');
    await client.link('simon');
    expect(client.getStatus()).toBe('linked');
    expect(client.getUsername()).toBe('simon');
    client.send({ type: 'custom/message', payload: 'Hello, world!' });
    await client.unlink();
    expect(client.getUsername()).toBe(undefined);
    expect(client.getStatus()).toBe('connected');
    await client.disconnect();
    expect(client.getStatus()).toBe('closed');
  });

  // TODO: Test for non-Krmx WebSocket server
  // TODO: Test for version mismatch with Krmx server
  // TODO: Test for authentication failure / success with Krmx server
  // TODO: Test for when connecting fails
  // TODO: Test for when connection is lost
  // TODO: Test for reconnect when no current connection
  // TODO: Test for reconnect when current connection (and linked?)
  // TODO: Test for link when no current connection
  // TODO: Test for link when current connection
  // TODO: Test for unlink when no current connection
  // TODO: Test for unlink when current connection
  // TODO: Test for send when no current connection

  // TODO: Add more tests
});
