# Krmx
Krmx is a network protocol for realtime multi-user interactions.

## Getting Started
If you want to build your own application using Krmx, you should start be reading the [Krmx documentation](https://simonkarman.github.io/krmx).

## Contributing
If you want to help improve Krmx or add new features. You can create a pull request. You can find the different components in these directories:

- [docs/](./docs): documentation of both the Krmx protocol and the reference implementations
- [base/](./base): shared code between the Krmx client and Krmx server in TypeScript
- [server/](./server): reference implementation of a Krmx server in TypeScript NodeJS
- [client/](./client): reference implementation of a Krmx client in TypeScript (compatible NodeJS and browser)
- [client-react/](./client-react): reference implementation of a Krmx client as a React hook
- [state/](./state): Krmx State implementation, including base library, a server and a React client addon
- [package.json](./package.json): root module that uses Husky to set up a pre-commit git hook that executes `npm run validate` in every submodule

The base, server, client, client-react, and state implementations are published on npm under the [krmx](https://www.npmjs.com/org/krmx) npmjs organisation.

> Possible upcoming features and ideas can be found in [features.md](./features.md).

If you find any issues when using Krmx, then please create a ticket here: [krmx/issues](https://github.com/simonkarman/krmx/issues).

### Contributors
- [Simon Karman](https://www.simonkarman.nl) - *creator of Krmx*
