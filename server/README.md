# @krmx/server
The server side implementation of krmx (the custom websocket protocol for session based message sharing). Works in combination with [@krmx/client](https://www.npmjs.com/package/@krmx/client) in React.

You can find the documentation of Krmx [here](https://simonkarman.github.io/krmx).

## Getting Started
First install the `@krmx/server` package using npm or yarn.
```bash
npm install @krmx/server
// or
yarn add @krmx/server
```

Then, you can create a simple server using the following setup. The api level documentation can be found on the type definitions.
```typescript
import { createServer, LogSeverity, Props } from '@krmx/server';

const props: Props = { /* configure here */ }
const server = createServer(props);

server.on('authenticate', (username, isNewUser, reject) => {
  if (isNewUser && server.getUsers().length > 4) {
    reject('server is full');
  }
});

server.on('message', (username, message) => {
  console.debug(`[debug] [krmx] ${username} sent ${message.type}`);
});

server.listen(8082);
```
Krmx clients should now be able to connect using `ws://localhost:8082` on your local machine.

## Issues
If you find any issues when using `@krmx/server`, then please create a ticket here: [krmx/issues](https://github.com/simonkarman/krmx/issues).
