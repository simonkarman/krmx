## Possible Upcoming features
There are different components that together form the krmx protocol. Each has its own possible upcoming features. This is just a list of ideas, this means that for something to be on the list it doesn't mean it will necessarily be added.

### krmx base
1. Middleware - Create support for middleware (game / matchmaking / custom...)
2. Hot Reloading: Emit event that allows writing server state to disk on exit (or state change) and allow to restart a server with state
3. Identities - Using JWT in authenticate message for credentials
4. Connection Cleanup - Close unresponsive (verify with ping pong) connections and close connections that are not accepted after X seconds
5. CLI Startup - Add cli command to start a new server on specific port (and with specific user(s) allowed to join)
6. CLI Output - Show server output (connected users) via a self updating user table such as k9s output

### krmx game middleware
1. Ready Up - Add pre game ready up phase where players can join/leave and accept to play and once everyone is ready start the game
2. Late Joiners - Don't allow new players joining after the game has started
3. Admin - Ensure one player is always the host of the game that can kick players and start the game during ready up
4. Settings - Add configurable (only by host) game settings to ready up phase and unready everyone on changes
5. Exit Process - Exit the server process when all players have left, or everyone is inactive/disconnected for X seconds
6. Auto Pause - On unlink/link pause/continue the game
7. Inactivity - Keep track of inactive players and kick them if needed

### krmx matchmaking middleware
1. Admin - Move server websocket to a different http path, and have some paths for requesting game status information
2. Advertise Servers - Have a serverless management system (in AWS) to which servers will advertise that they're running
3. List - Serverless endpoint at which clients can list available servers
4. Create - Serverless endpoint at which clients can start a new server
5. Health - A http health endpoint to check that a server is still available (polling)
