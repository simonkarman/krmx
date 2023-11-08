import React from 'react';
import { create } from 'react-test-renderer';
import { KrmxProvider, useKrmx } from '../src';

function MyApp(props: { serverUrl: string }) {
  return <KrmxProvider
    serverUrl={props.serverUrl}
    onMessage={(message) => console.info(message)}
  >
    <MyComponent/>
  </KrmxProvider>;
}

function MyComponent() {
  const {
    isConnected, isLinked, link, rejectionReason, send, leave, users,
  } = useKrmx();
  if (!isConnected) {
    // Your logic for when you're not connected to the server goes here
    return <p>No connection to the server...</p>;
  }
  if (!isLinked) {
    // Your logic for linking your connection with a user goes here
    return <div>
      <button onClick={() => link('simon')}>Join!</button>
      {rejectionReason && <p>Rejected: {rejectionReason}</p>}
    </div>;
  }
  // Your logic for when you're ready to go goes here
  return (<div>
    <p>
      Welcome <strong>simon</strong>!
    </p>
    <button onClick={() => send({ type: 'custom/hello' })}>Send custom/hello</button>
    <button onClick={leave}>Leave</button>
    <h2>Users</h2>
    <ul>
      {Object.entries(users).map(([otherUsername, { isLinked }]) => <li key={otherUsername}>{isLinked ? '🟢' : '🔴'} {otherUsername}</li>)}
    </ul>
  </div>);
}

describe('Client', () => {
  it('useKrmx should be a function', () => {
    expect(useKrmx).toStrictEqual(expect.any(Function));
  });
  it('useKrmx should show no connection when connection cannot be established', () => {
    const myApp = create(<MyApp serverUrl='ws://localhost:1234' />);
    expect(myApp.toJSON()).toMatchInlineSnapshot(`
<p>
  No connection to the server...
</p>
`);
  });
});
