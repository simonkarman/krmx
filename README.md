# Krmx
Krmx is a network protocol for realtime multi-user interactions.

## Getting Started
If you want to build your own application using Krmx, you should start be reading the [Krmx documentation](https://simonkarman.github.io/krmx).

## Contributing
If you want to help improve Krmx or add new features. You can create a pull request. You can find the different components in these directories:

- [docs/](./docs): documentation of both the Krmx protocol and the reference implementations
- [server/](./server): reference implementation of a Krmx server in TypeScript NodeJS
- [client/](./client): reference implementation of a Krmx client as a React hook
- [package.json](./package.json): root module that uses Husky to set up a pre-commit git hook that executes `npm run precommit` in every submodule

Both the server and client implementations are published on npm under the [krmx](https://www.npmjs.com/org/krmx) npmjs organisation.

> Possible upcoming features and ideas can be found in [features.md](./features.md).

If you find any issues when using Krmx, then please create a ticket here: [krmx/issues](https://github.com/simonkarman/krmx/issues).

### Contributors
- [Simon Karman](https://www.simonkarman.nl) - *creator of Krmx*
