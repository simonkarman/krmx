## Ideas and upcoming features
There are multiple components that together form Krmx. Each has its own possible upcoming features.

To see what Krmx currently has to offer read the [Krmx documentation](https://simonkarman.github.io/krmx).

> Note: This is just a list of ideas, this means that something being on the list is no guarantee for it actually being implemented.

### Krmx Server
1. Hot Reloading: Emit event that allows writing server state to disk on exit (or state change) and allow to restart a server with state
2. Connection Cleanup - Close unresponsive (verify with ping pong) connections and close connections that are not accepted after X seconds
3. CLI Startup - Add cli command to start a new server on specific port (and with specific user(s) allowed to join)
4. CLI Output - Show server output (connected users) via a self updating user table such as k9s output
5. Server Metadata - Create a simplified way to create a http metadata/health endpoint on the Krmx server that can be used to verify that a server is still available and what the status of the server is (could include connected users, server version, etc.).
6. Async Auth - Allow to authenticate in server to run async code (e.g. check with a database) before accepting a connection

### Krmx GitHub
1. Setup GitHub workflows for publishing of the individual package from the main branch 
2. Disable directly pushing to main and ensure feature branches run an integration test suite to verify functionality before merging
