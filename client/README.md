# @krmx/client
The client side implementation of krmx (the custom websocket protocol for session based message sharing) in React. Works in combination with [@krmx/server](https://www.npmjs.com/package/@krmx/server).

## Documentation
You can find the documentation of Krmx [here]().

## Getting Started
First install the `@krmx/client` package using npm or yarn.
```bash
npm install @krmx/client
// or
yarn add @krmx/client
```

Then, you can create a simple React client using the following setup.
```typescript jsx
import { KrmxProviderWithStore, useKrmx } from '@krmx/client';
import { useState } from 'react';

// Note: Don't use `KrmxProviderWithStore` if you are already creating a redux store in your app.
//       In that case, add the exported `krmxSlice` to your store and use `KrmxProvider` directly.
const { KrmxProvider } = KrmxProviderWithStore();
function MyApp() {
  const [serverUrl] = useState('ws://localhost:8082');
  return (
    <KrmxProvider
      serverUrl={serverUrl}
      onMessage={(message) => console.info(message)}
    >
      <MyComponent/>
    </KrmxProvider>
  );
}
function MyComponent() {
  const { isConnected, isLinked, link, rejectionReason, send, leave, users } = useKrmx();
  if (!isConnected) {
    // Your logic for when you're not connected to the server goes here
    return <p>No connection to the server...</p>;
  }
  if (!isLinked) {
    // Your logic for linking your connection with a user goes here
    return (
      <div>
        <button onClick={() => link('simon')}>Join!</button>
        {rejectionReason && <p>Rejected: {rejectionReason}</p>}
      </div>
    );
  }
  // Your logic for when you're ready to go goes here
  return (
    <div>
      <p>
        Welcome <strong>simon</strong>!
      </p>
      <button onClick={() => send({ type: 'custom/hello' })}>Send custom/hello</button>
      <button onClick={leave}>Leave</button>
      <h2>Users</h2>
      <ul>
        {Object.entries(users)
          .map(([otherUsername, { isLinked }]) => (
            <li key={otherUsername}>
              {isLinked ? '🟢' : '🔴'} {otherUsername}
            </li>)
          )}
      </ul>
    </div>
  );
}
```

## Issues
If you find any issues when using `@krmx/client`, then please create a ticket here: [krmx/issues](https://github.com/simonkarman/krmx/issues).
