## Ideas and upcoming features
There are multiple components that together form Krmx. Each has its own possible upcoming features.

To see what Krmx currently has to offer read the [Krmx documentation](https://simonkarman.github.io/krmx).

> Note: This is just a list of ideas, this means that something being on the list is no guarantee for it actually being implemented.

### Krmx
1. Server Metadata - Create a simplified way to create a http metadata/health endpoint on the Krmx server that can be used to verify that a server is still available and what the status of the server is (could include connected users, server version, etc.).
2. Integration Testing - Add a testing suite that tests complete integration for Krmx Server and Client implementations

### Krmx State
1. Hot Reloading - Emit event that allows writing server state to disk on exit (or state change) and allow to restart a server with state
2. Class Serialization - Allow serialization of data that contains classes with custom toJson and fromJson implementations

### Krmx Starter
1. Npx Command - Publish a `npx create krmx-app` command that bootstraps a new Krmx application with a basic setup including Krmx State.
