import { Message } from '@krmx/base';
import { createClient } from '@krmx/client';
import { createServer, Server } from '@krmx/server';
import React from 'react';
import { act, create, ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import { createClientReact } from '../src';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
function buttonWithText(text: string) {
  return (n: ReactTestInstance) => {
    return n.type === 'button' &&
           n.children.length > 0 &&
           n.children.every(c => typeof c === 'string') &&
           n.children.join(' ').toLowerCase().includes(text.toLowerCase());
  };
}

function useTestBase(run: ((props: {
  server: Server,
  client: ReturnType<typeof createClientReact>['client'],
  app: ReactTestRenderer,
  serverUrl: string,
}) => Promise<void>)): () => Promise<void> {
  return async () => {
    // Setup server and client
    const server = createServer();
    const { client, useKrmx } = createClientReact();
    try {
      const listenPromise = server.waitFor('listen');
      server.listen();
      const [port] = await listenPromise;

      // Create component
      const KrmxComponent = (props: { serverUrl: string, linkAs: string }) => {
        const { status, username, users } = useKrmx();
        if (['initializing', 'connecting', 'closing', 'closed'].includes(status)) {
          return (<div>
            <p>No connection to the server.</p>
            <button onClick={() => client.connect(props.serverUrl)}>
              Connect
            </button>
          </div>);
        }
        if (['connected', 'linking', 'unlinking'].includes(status)) {
          return (<div>
            <p>Connected to the server, but not yet linked.</p>
            <button onClick={() => client.link(props.linkAs)}>Link as {props.linkAs}</button>
            <button onClick={() => client.disconnect()}>Disconnect</button>
          </div>);
        }
        return (<div>
          <p>Hello, {username}. Users: {users.map(u => u.isLinked ? u.username : `${u.username} (unlinked)`).join(', ')}</p>
          <button onClick={() => client.send({ type: 'custom/message', payload: 'hi, world!' })}>Send message</button>
          <button onClick={() => client.leave()}>Leave</button>
        </div>);
      };

      // Render the component
      const serverUrl = 'ws://localhost:' + (port);
      const app = create(<KrmxComponent serverUrl={serverUrl} linkAs={'simon'}/>);
      await run({ server, client, app, serverUrl });

    } catch (e) {
      console.error('error!', e);
    } finally {
      // Close the client and server
      if (!['initializing', 'closed'].includes(client.getStatus())) {
        await client.disconnect(true);
      }
      const closePromise = server.waitFor('close');
      server.close();
      await closePromise;
    }
  };
}

describe('Client React', () => {
  it('should render KrmxComponent', useTestBase(async ({ app, server, serverUrl }): Promise<void> => {
    expect(app.toJSON()).toMatchInlineSnapshot(`
      <div>
        <p>
          No connection to the server.
        </p>
        <button
          onClick={[Function]}
        >
          Connect
        </button>
      </div>
    `);

    // Connect to the server
    await act(async () => {
      app.root.findByType('button').props.onClick();
      await sleep(30);
    });
    expect(app.toJSON()).toMatchInlineSnapshot(`
      <div>
        <p>
          Connected to the server, but not yet linked.
        </p>
        <button
          onClick={[Function]}
        >
          Link as 
          simon
        </button>
        <button
          onClick={[Function]}
        >
          Disconnect
        </button>
      </div>
    `);

    // Link to a user
    await act(async () => {
      app.root.find(buttonWithText('link')).props.onClick();
      await sleep(30);
    });
    expect(app.toJSON()).toMatchInlineSnapshot(`
      <div>
        <p>
          Hello, 
          simon
          . Users: 
          simon
        </p>
        <button
          onClick={[Function]}
        >
          Send message
        </button>
        <button
          onClick={[Function]}
        >
          Leave
        </button>
      </div>
    `);
    expect(server.getUsers()).toStrictEqual([{ username: 'simon', isLinked: true }]);

    // Send a message to the server
    let username = 'none';
    let message: Message = { type: 'none', payload: undefined };
    await act(async () => {
      const messagePromise = server.waitFor('message');
      app.root.find(buttonWithText('send message')).props.onClick();
      [username, message] = await messagePromise;
    });
    expect(username).toBe('simon');
    expect(message).toStrictEqual({ type: 'custom/message', payload: 'hi, world!' });

    // Link another user
    await act(async () => {
      const lisa = createClient();
      await lisa.connect(serverUrl);
      await lisa.link('lisa');
      await lisa.disconnect(true);
      await sleep(30);
    });
    expect(app.toJSON()).toMatchInlineSnapshot(`
      <div>
        <p>
          Hello, 
          simon
          . Users: 
          simon, lisa (unlinked)
        </p>
        <button
          onClick={[Function]}
        >
          Send message
        </button>
        <button
          onClick={[Function]}
        >
          Leave
        </button>
      </div>
    `);

    // Unlink
    await act(async () => {
      app.root.find(buttonWithText('leave')).props.onClick();
      await sleep(30);
    });
    expect(app.toJSON()).toMatchInlineSnapshot(`
      <div>
        <p>
          Connected to the server, but not yet linked.
        </p>
        <button
          onClick={[Function]}
        >
          Link as 
          simon
        </button>
        <button
          onClick={[Function]}
        >
          Disconnect
        </button>
      </div>
    `);
    expect(server.getUsers()).toStrictEqual([{ username: 'lisa', isLinked: false }]);

    // Disconnect
    await act(async () => {
      app.root.find(buttonWithText('disconnect')).props.onClick();
      await sleep(30);
    });
    expect(app.toJSON()).toMatchInlineSnapshot(`
      <div>
        <p>
          No connection to the server.
        </p>
        <button
          onClick={[Function]}
        >
          Connect
        </button>
      </div>
    `);

    // Dismount to close the connection
    await act(() => app.update(<></>));
  }));
});
