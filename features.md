## Ideas and upcoming features
There are multiple components that together form Krmx. Each has its own possible upcoming features.

To see what Krmx currently has to offer read the [Krmx documentation](https://simonkarman.github.io/krmx).

> Note: This is just a list of ideas, this means that something being on the list is no guarantee for it actually being implemented.


### Krmx
1. Connection Cleanup - Close unresponsive (verify with ping pong) connections and close connections that are not accepted after X seconds.
2. Server Metadata - Create a simplified way to create a http metadata/health endpoint on the Krmx server that can be used to verify that a server is still available and what the status of the server is (could include connected users, server version, etc.).
3. Async Auth - Allow to authenticate in server to run async code (e.g. check with a database) before accepting a connection
4. Integration Testing - Add a testing suite that tests complete integration for Krmx Server and Client implementations

### Krmx GitHub
1. CI/CD Publish - Setup GitHub workflows for publishing of the individual package from the main branch 
2. Pull Requests - Disable directly pushing to main and ensure feature branches run an integration test suite to verify functionality before merging
3. Local Development - Ensure local development of Krmx is easy by ensure that all package reference the local file and run in watch mode.

### Krmx State
1. Hot Reloading - Emit event that allows writing server state to disk on exit (or state change) and allow to restart a server with state

### Krmx Starter
1. npx command - Publish a `npx create krmx-app` command that bootstraps a new Krmx application with a basic setup including Krmx State.
