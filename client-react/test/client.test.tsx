import React, { ReactElement, useState } from 'react';
import { act, create } from 'react-test-renderer';
import { KrmxProvider, useKrmx } from '../src';
import { createServer } from '@krmx/server';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

global['WebSocket'] = require('ws');
global['crypto'] = require('crypto');

function MyApp(props: { serverUrl: string }): ReactElement {
  return <KrmxProvider serverUrl={props.serverUrl}>
    <MyComponent/>
  </KrmxProvider>;
}

function MyComponent() {
  const {
    isConnected, reconnect,
    username, isLinked, link, rejectionReason,
    send, unlink, leave, users,
    useMessages,
  } = useKrmx();
  const [counter, setCounter] = useState(0);
  useMessages((message: unknown) => {
    console.info('received', message);
    setCounter(c => c + 1);
  }, []);
  if (!isConnected) {
    // Your logic for when the app cannot connect to the server goes here
    return <>
      <h1>No connection to the server...</h1>
      <button onClick={() => reconnect()}>Reconnect</button>
    </>;
  }
  if (!isLinked) {
    // Your logic for linking your connection to a user goes here
    return <>
      <h1>Login</h1>
      <button onClick={() => link('simon')}>Join!</button>
      {rejectionReason && <p>Rejected: {rejectionReason}</p>}
    </>;
  }
  // Your app logic go goes here
  return (<>
    <h1>Welcome <strong>{username}</strong>!</h1>
    <button onClick={() => send({ type: 'custom/hello' })}>Send custom/hello</button>
    <button onClick={leave}>Leave</button>
    <button onClick={unlink}>Unlink</button>
    <p>You have received {counter} message(s) from the server.</p>
    <h2>Users</h2>
    <ul>
      {Object.entries(users).map(([otherUsername, { isLinked }]) => <li key={otherUsername}>{isLinked ? '🟢' : '🔴'} {otherUsername}</li>)}
    </ul>
  </>);
}

describe('Client', () => {
  it('useKrmx should be a function', () => {
    expect(useKrmx).toStrictEqual(expect.any(Function));
  });
  it('useKrmx should show no connection when connection cannot be established', () => {
    const myApp = create(<MyApp serverUrl='ws://localhost:1234' />);
    expect(JSON.stringify(myApp.toJSON())).toMatchInlineSnapshot(
      '"['
        + '{"type":"h1","props":{},"children":["No connection to the server..."]},'
        + '{"type":"button","props":{},"children":["Reconnect"]}'
      + ']"',
    );
  });
  it('useKrmx should connect to the server', async () => {
    const server = createServer();
    try {
      // Wait for server to start
      const portNumber = await new Promise<number>((resolve) => {
        server.on('listen', resolve);
        server.listen();
      });
      const myApp = create(<MyApp serverUrl={'ws://localhost:' + (portNumber - 1)}/>);

      // Connect to server
      await act(async () => {
        myApp.update(<MyApp serverUrl={'ws://localhost:' + portNumber}/>);
        await sleep(50);
      });
      expect(JSON.stringify(myApp.toJSON())).toMatchInlineSnapshot(
        '"['
        + '{"type":"h1","props":{},"children":["Login"]},'
        + '{"type":"button","props":{},"children":["Join!"]}'
        + ']"',
      );

      // Link!
      await act(async () => {
        myApp.root.findByType('button').props.onClick();
        await sleep(20);
      });
      expect(JSON.stringify(myApp.toJSON())).toMatchInlineSnapshot(
        '"[' +
        '{"type":"h1","props":{},"children":["Welcome ",{"type":"strong","props":{},"children":["simon"]},"!"]},' +
        '{"type":"button","props":{},"children":["Send custom/hello"]},{"type":"button","props":{},"children":["Leave"]},' +
        '{"type":"button","props":{},"children":["Unlink"]},' +
        '{"type":"p","props":{},"children":["You have received ","0"," message(s) from the server."]},' +
        '{"type":"h2","props":{},"children":["Users"]},{"type":"ul","props":{},"children":[{"type":"li","props":{},"children":["🟢"," ","simon"]}]}' +
        ']"',
      );
    } finally {
      await new Promise<void>((resolve) => {
        server.on('close', resolve);
        server.close();
      });
    }
  });
});
