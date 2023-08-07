# Krmx
A TypeScript-based multi-client message sharing protocol build on top of WebSockets.

Both the server and client implementations are published on npm under the [krmx](https://www.npmjs.com/org/krmx) organisation.

## Using Krmx
If you want to build your own application using Krmx, you should start be reading the [Krmx documentation](https://simonkarman.github.io/krmx).

## Improving Krmx
If you want to help improve Krmx or add new features. You can create a pull request. You can find the different components in these directories:

- **@krmx/server**: implementation in NodeJS in the [server/](./server) directory
- **@krmx/client**: implementation in React in the [client/](./client) directory
- **docs**: documentation of krmx written in Nextra in the [docs/](./docs) directory
- **root**: the [module in the root directory](./package.json) uses Husky to set up a pre-commit git hook that executes `npm run precommit` in every submodule

> Possible upcoming features and ideas can be found in [features.md](./features.md).

If you find any issues when using Krmx, then please create a ticket here: [krmx/issues](https://github.com/simonkarman/krmx/issues).

## Author
Original Author - [Simon Karman](https://www.simonkarman.nl).
