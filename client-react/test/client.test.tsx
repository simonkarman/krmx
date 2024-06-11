import { createServer, Server } from '@krmx/server';
import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { createReactClient } from '../src';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function useTestBase(run: ((props: {
  server: Server,
  client: ReturnType<typeof createReactClient>['client'],
  app: ReactTestRenderer,
}) => Promise<void>)): () => Promise<void> {
  return async () => {
    // Setup server and client
    const server = createServer();
    const { client, useKrmx } = createReactClient();
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
          <p>Hello, {username}. Users: {users.map(u => u.username).join(', ')}</p>
          <button onClick={() => client.send({ type: 'custom/message', payload: 'hi, world!' })}>Send message</button>
          <button onClick={() => client.unlink()}>Unlink</button>
          <button onClick={() => client.leave()}>Leave</button>
        </div>);
      };

      // Render the component
      const app = create(<KrmxComponent serverUrl={'ws://localhost:' + (port)} linkAs={'simon'}/>);
      await run({ server, client, app });

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
  it('should render KrmxComponent', useTestBase(async ({ app }): Promise<void> => {
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

    // Dismount to close the connection
    await act(() => app.update(<></>));
  }));
});
