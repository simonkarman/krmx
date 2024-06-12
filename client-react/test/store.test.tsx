import { createServer } from '@krmx/server';
import React from 'react';
import { act, create } from 'react-test-renderer';
import { createClient, createStore } from '../src';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

describe('Store', () => {
  it('should render KrmxComponent', async () => {
    // Create a server
    const server = createServer();
    try {
      const port = await new Promise<number>(resolve => {
        server.once('listen', resolve);
        server.listen();
      });

      // Example of a message store that tracks the last 2 messages
      const { client, useClient } = createClient();
      const useMessageStore = createStore(
        client,
        [] as { id: string, content: string }[],
        (state, message) => {
          return [...state, { id: crypto.randomUUID(), content: message.type }].slice(-2);
        },
        s => s.map(m => ({ key: m.id, data: m.content })),
      );

      // Already connect the client to the server
      await client.connect('ws://localhost:' + port);
      await client.link('simon');

      // Create a component that uses the client and the message store
      const MyComponent = () => {
        const { status } = useClient();
        const messages = useMessageStore();
        return <div>
          <p>Status: {status}</p>
          <h1>Received Messages</h1>
          <ul>{messages.map(m => <li key={m.key}>{m.data}</li>)}</ul>
        </div>;
      };

      // Render the component
      const app = create(<MyComponent/>);
      expect(app.toJSON()).toMatchInlineSnapshot(`
        <div>
          <p>
            Status: 
            linked
          </p>
          <h1>
            Received Messages
          </h1>
          <ul />
        </div>
      `);

      // Receive custom messages
      await act(async () => {
        server.send('simon', { type: 'custom/message' });
        await sleep(300);
      });
      expect(app.toJSON()).toMatchInlineSnapshot(`
        <div>
          <p>
            Status: 
            linked
          </p>
          <h1>
            Received Messages
          </h1>
          <ul>
            <li>
              custom/message
            </li>
          </ul>
        </div>
      `);

      // Leaving should reset the state
      await act(async () => {
        await client.leave();
        await sleep(30);
      });
      expect(app.toJSON()).toMatchInlineSnapshot(`
        <div>
          <p>
            Status: 
            connected
          </p>
          <h1>
            Received Messages
          </h1>
          <ul />
        </div>
      `);

      // Dismount to close the connection
      await act(async () => {
        await client.disconnect();
        app.update(<></>);
      });
    } finally {
      await new Promise<void>(resolve => {
        server.once('close', resolve);
        server.close();
      });
    }
  });
});
