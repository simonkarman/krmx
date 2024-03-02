import React, { ReactElement } from 'react';
import { create } from 'react-test-renderer';
import { KrmxProvider, useKrmx } from '../src';

global['WebSocket'] = require('ws');

function MyApp(props: { serverUrl: string }): ReactElement {
  return <KrmxProvider
    serverUrl={props.serverUrl}
    onMessage={(message) => console.info(message)}
  >
    <MyComponent/>
  </KrmxProvider>;
}

function MyComponent() {
  const {
    isConnected, reconnect,
    username, isLinked, link, rejectionReason,
    send, unlink, leave, users,
  } = useKrmx();
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
});
