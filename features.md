## Ideas and upcoming features
There are multiple components that together form Krmx. Each has its own possible upcoming features.

To see what Krmx currently has to offer read the [Krmx documentation](https://simonkarman.github.io/krmx).

> Note: This is just a list of ideas, this means that something being on the list is no guarantee for it actually being implemented.

### Krmx Server
1. Hot Reloading: Emit event that allows writing server state to disk on exit (or state change) and allow to restart a server with state
2. Identities - Using JWT in authenticate message for credentials
3. Connection Cleanup - Close unresponsive (verify with ping pong) connections and close connections that are not accepted after X seconds
4. CLI Startup - Add cli command to start a new server on specific port (and with specific user(s) allowed to join)
5. CLI Output - Show server output (connected users) via a self updating user table such as k9s output

### Krmx Game middleware
Create a middleware layer that can be reused when creating a game with Krmx.

1. Ready Up - Add pre game ready up phase where players can join/leave and accept to play and once everyone is ready start the game
2. Late Joiners - Don't allow new players joining after the game has started
3. Admin - Ensure one player is always the host of the game that can kick players and start the game during ready up
4. Settings - Add configurable (only by host) game settings to ready up phase and unready everyone on changes
5. Exit Process - Exit the server process when all players have left, or everyone is inactive/disconnected for X seconds
6. Auto Pause - On unlink/link pause/continue the game
7. Inactivity - Keep track of inactive players and kick them if needed

### Krmx Matchmaking
Create a way for clients to discover Krmx servers.

1. Admin - Move server websocket to a different http path, and have some paths for requesting game status information
2. Advertise Servers - Have a serverless management system (in AWS) to which servers will advertise that they're running
3. List Servers - Serverless endpoint at which clients can list available servers
4. Create Server - Serverless endpoint at which clients can start a new server
5. Server Metadata - Add a http metadata/health endpoint on the Krmx server that can be used to verify that a server is still available and what the status of the server is
