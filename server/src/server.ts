import http from 'http';
import { DateTime } from 'luxon';
import short from 'short-uuid';
import ws, { AddressInfo, RawData, WebSocket, WebSocketServer } from 'ws';
import { EventGenerator, EventEmitter } from './event-generator';
import { ExpectedQueryParams, hasExpectedQueryParams } from './utils';

interface UserLinkMessage { type: 'user/link', payload: { username: string } }
interface UserUnlinkMessage { type: 'user/unlink' }
interface UserLeaveMessage { type: 'user/leave' }
type FromConnectionMessage = UserLinkMessage | UserUnlinkMessage | UserLeaveMessage;

interface UserRejectedMessage { type: 'user/rejected', payload: { reason: string } }
interface UserAcceptedMessage { type: 'user/accepted' }
interface UserJoinedMessage { type: 'user/joined', payload: { username: string } }
interface UserLinkedMessage { type: 'user/linked', payload: { username: string } }
interface UserUnlinkedMessage { type: 'user/unlinked', payload: { username: string } }
interface UserLeftMessage { type: 'user/left', payload: { username: string } }
type FromServerMessage = UserRejectedMessage | UserAcceptedMessage | UserJoinedMessage |
  UserLinkedMessage | UserUnlinkedMessage | UserLeftMessage;

/**
 * The severity of a log message.
 */
export type LogSeverity = 'debug' | 'info' | 'warn' | 'error';

/**
 * Logger that the Server will use to output log messages.
 *
 * @param severity Indicates the severity of the log message.
 * @param args The arguments that describe the event that occurred.
 */
export type Logger = (severity: LogSeverity, ...args: unknown[]) => void;

/**
 * The properties with which to create the Server.
 */
export interface Props {
  /**
   * The http configuration that the Server should use.
   *
   * @default When not provided, a new http server will be created and the WebSocket server will be on the root path.
   */
  http?: {
    /**
     * The http server that the Server should use.
     *
     * @default When not provided, a new http server will be created.
     */
    server?: http.Server;

    /**
     * The http path the Server should use for the websocket server.
     *
     * @default When not provided, the websocket server will be use the root path.
     */
    path?: string;

    /**
     * Query string parameters that all connections must provide in their connection url.
     *
     * For example: when it is set to { krmx: 'my-server-1-0-2' } a client should connect with 'ws:127.0.0.1:80/example?krmx=my-server-1-0-2'
     */
    queryParams?: ExpectedQueryParams;
  };

  /**
   * The logger that the Server should use.
   *
   * @default When not provided, it will log (non debug) to the standard console.
   */
  logger?: Logger;

  /**
   * Whether metadata should be added to messages send over websocket connections.
   *
   * If set to true, each message send or broadcast to users will include a 'metadata' field in the root of the json message including the timestamp
   *  it was sent and whether the message was a broadcast.
   *
   * Example of a message that was sent when metadata is set to true:
   *  {
   *    type: "custom/message",
   *    payload: { value: 3 },
   *    metadata: { isBroadcast: false, timestamp: "2023-04-07T19:17:11.432Z" },
   *  }
   *
   * @default When not provided, no metadata will be added to messages.
   */
  metadata?: boolean;

  /**
   * Whether the server should accept new users. If set to false, only users joined via server.join(<username>) can join the server.
   *
   * @default When not provided, the server will accept new users.
   */
  acceptNewUsers?: boolean;

  /**
   * A predicate that determines what the server should consider to be a valid username.
   *
   * @default When not provided, the server will validate usernames using the following regex: /^[a-z0-9]{3,20}$/.
   */
  isValidUsername?: (username: string) => boolean;
}

/**
 * Status of a server.
 *
 * @description *initializing*: The server is initializing, but is not yet listening. This allows you to configure callbacks for the server
 *  before it starts listening.
 * @description *starting*: The listen method of the server has been invoked, but the server is not yet listening.
 * @description *listing*: The server is listening for new connections.
 * @description *closing*: The close method of the server has been invoked, but the server has not yet closed.
 * @description *closed*: The server has closed.
 */
export type Status = 'initializing' | 'starting' | 'listening' | 'closing' | 'closed';

/**
 * Representation of a user on the server.
 */
export interface User {
  /**
   * The name of the user.
   */
  username: string;

  /**
   * Whether the user is linked to a connection.
   */
  isLinked: boolean;
}

/**
 * A message.
 */
export type Message = { type: string };

export type Events = {
  /**
   * This event is emitted once the server has started listening and is ready to accept connections.
   *
   * @param port The port at which the server started listening.
   */
  listen: [port: number];

  /**
   * This event is emitted once the server has closed.
   */
  close: [];

  /**
   * This event is emitted before a connection tries to link to a user.
   *
   * @param username The username that the connection is trying to link to.
   * @param isNewUser Whether this username belongs to a user already known to the server (false) or a new user that will be created if linking succeeds (true).
   * @param reject A reject callback that, if invoked, will reject the linking to the user with the provided reason.
   */
  authenticate: [username: string, isNewUser: boolean, reject: (reason: string) => void];

  /**
   * This event is emitted every time a user has joined.
   *
   * @param username The username of the user that joined.
   */
  join: [username: string];

  /**
   * This event is emitted every time a user has linked to a connection.
   *
   * @param username The username of the user that linked to a connection.
   */
  link: [username: string];

  /**
   * This event is emitted every time a user has unlinked from its connection.
   *
   * @param username The username of the user that unlinked from its connection.
   */
  unlink: [username: string];

  /**
   * This event is emitted every time a user has left.
   *
   * @param username The username of the user that left.
   */
  leave: [username: string];

  /**
   * This event is emitted every time a user sends a message to the server.
   *
   * @param username The username of the user that send the message.
   * @param message The content of the message that the user sent.
   */
  message: [username: string, message: Message];
}

/**
 * Server is a websocket server that abstracts individual websocket connections into users.
 */
export interface Server extends EventEmitter<Events> {
  /**
   * Start listening at the specified port number.
   * This function is asynchronous, the server is listening once the server emits a 'listen' event.
   *
   * Note: If you provided a http server that is already listening, then you can leave the port undefined or use the exact same port number. If you
   *  provide a different port number, this method will throw an error.
   *
   * @param port The port number at which to start the server. When not provided, the server will start listening at an available port.
   */
  listen(port?: number): void;

  /**
   * Close the server.
   * This function is asynchronous, the server is closed when all connections are ended and the server emits a 'close' event.
   */
  close(): void;

  /**
   * Broadcast a message to all users, that are currently connected to the server.
   *
   * @param message The message to send to all the users.
   * @param skipUsername (optional) The username of the user you want to skip sending this message to.
   */
  broadcast<TMessage extends Message>(message: TMessage, skipUsername?: string): void;

  /**
   * Send a message to a specific user.
   *
   * @param username The username of the user to send the message to.
   * @param message The message to send to the user.
   */
  send<TMessage extends Message>(username: string, message: TMessage): void;

  /**
   * Join a new (unlinked) user to the server.
   *
   * @param username The username of the user to join to the server.
   */
  join(username: string): void;

  /**
   * Unlink the connection of a user from the server.
   *
   * @param username The username of the user to unlink from its connection.
   */
  unlink(username: string): void;

  /**
   * Kick a user from the server.
   *
   * @param username The username of the user to kick from the server.
   */
  kick(username: string): void;

  /**
   * Get the current status of the server.
   */
  getStatus(): Status;

  /**
   * Get the current users known to the server.
   */
  getUsers(): User[];
}

/**
 * Create a new Server.
 * Note: This does not make the server start listening for connections, you can do that using the `.listen(<port>)` method on the created object.
 *
 * @param props The properties with which the server should be initialized.
 */
export function createServer(props?: Props): Server {
  return ServerImpl.create(props);
}

class ServerImpl extends EventGenerator<Events> implements Server {
  private readonly httpServer: http.Server;
  private readonly httpQueryParams: ExpectedQueryParams;
  private readonly logger: Logger;
  private readonly metadata: boolean;
  private readonly acceptNewUsers: boolean;
  private readonly isValidUsername: (username: string) => boolean;

  private readonly connections: { [connectionId: string]: { socket: ws.WebSocket, username?: string } } = {};
  private readonly users: { [username: string]: { connectionId?: string } } = {};
  private status: Status;
  private canOnly(action: string, when: Status[] | Status): void {
    const cannot = typeof when === 'string'
      ? when !== this.status
      : !when.includes(this.status);
    if (cannot) {
      throw new Error(`cannot ${action} when the server is ${this.status}`);
    }
  }

  private constructor(props?: Props) {
    super();
    this.httpQueryParams = props?.http?.queryParams || {};
    this.logger = props?.logger ?? ((severity: LogSeverity, ...args: unknown[]) => {
      severity !== 'debug' && console[severity](`[${severity}] [server]`, ...args);
    });
    this.metadata = props?.metadata ?? false;
    this.acceptNewUsers = props?.acceptNewUsers ?? true;
    this.isValidUsername = props?.isValidUsername ?? ((username: string) => /^[a-z0-9]{3,20}$/.test(username));

    this.status = 'initializing';
    this.httpServer = props?.http?.server ?? new http.Server();
    const wsServer = new WebSocketServer({
      server: this.httpServer,
      path: props?.http?.path !== undefined
        ? (props.http.path.startsWith('/')
          ? props.http.path
          : `/${props.http.path}`)
        : undefined,
    });
    wsServer.on('connection', this.onConnectionOpen.bind(this));
    this.httpServer.on('close', this.onServerClose.bind(this));
  }
  static create(props?: Props): Server {
    return new ServerImpl(props);
  }

  public listen(port?: number): void {
    this.canOnly('start listening', 'initializing');
    if (this.httpServer.listening) {
      const httpServerPort = (this.httpServer.address() as AddressInfo).port;
      if (port !== undefined && port !== httpServerPort) {
        throw new Error(`cannot start listening on port ${port} as the underlying http server is already listening on port ${httpServerPort}`);
      }
      this.onServerListening();
    } else {
      this.status = 'starting';
      this.httpServer.on('listening', this.onServerListening.bind(this));
      this.httpServer.listen(port);
    }
  }
  private onServerListening() {
    this.status = 'listening';
    const address = this.httpServer.address() as AddressInfo;
    this.logger('info', `listening on port ${address.port}`);
    this.emit('listen', address.port);
  }
  private onConnectionOpen(socket: WebSocket, request: http.IncomingMessage): void {
    /* istanbul ignore next */
    if (this.status !== 'listening') {
      this.logger('debug', `incoming connection is immediately terminated as the server is ${this.status}`);
      socket.terminate();
      return;
    }

    if (!hasExpectedQueryParams(this.httpQueryParams, request.url)) {
      this.logger('debug', 'incoming connection is immediately terminated as its query parameters are invalid');
      socket.terminate();
      return;
    }

    const connectionId = `cn-${short.generate()}`;
    this.connections[connectionId] = { socket };
    this.logger('debug', `connection ${connectionId} opened`);

    socket.on('message', this.onConnectionData.bind(this, connectionId));
    socket.on('close', this.onConnectionClosed.bind(this, connectionId));
  }
  private tryParse(data: RawData): Message | false {
    try {
      const message: unknown = JSON.parse(data.toString());
      if (typeof message !== 'object' || message === null || !message) {
        return false;
      }
      const type = 'type' in message ? message.type : undefined;
      if (typeof type !== 'string') {
        return false;
      }
      return { ...message, type };
    } catch {
      return false;
    }
  }
  private onConnectionData(connectionId: string, data: RawData): void {
    const connection = this.connections[connectionId];
    const message = this.tryParse(data);
    if (message) {
      if (connection.username === undefined) {
        this.onUnlinkedConnectionMessage(connectionId, message);
      } else {
        this.onLinkedConnectionMessage(connection.username, message);
      }
    } else {
      // Invalid message
      this.logger('warn', `connection ${connectionId} sent an invalid message`);
      if (connection.username !== undefined) {
        this.unlink(connection.username);
      } else {
        const userRejectedMessage: UserRejectedMessage = { type: 'user/rejected', payload: { reason: 'invalid message' } };
        this.sendTo(connectionId, userRejectedMessage, false);
      }
    }
  }
  private onUnlinkedConnectionMessage(connectionId: string, message: FromConnectionMessage | Message) {
    let rejected = false;
    const reject = (reason: string) => {
      if (rejected) { return; }
      this.logger('debug', `connection ${connectionId} rejected, due to: ${reason}`);
      const userRejectedMessage: UserRejectedMessage = { type: 'user/rejected', payload: { reason } };
      this.sendTo(connectionId, userRejectedMessage, false);
      rejected = true;
    };
    if (message.type !== 'user/link') {
      reject('unlinked connection');
      return;
    }
    if (!('payload' in message) || typeof (message.payload.username as unknown) !== 'string') {
      reject('invalid link request');
      return;
    }
    const { username } = message.payload;
    if (!this.isValidUsername(username)) {
      reject('invalid username');
      return;
    }
    const isNewUser = this.users[username] === undefined;
    if (isNewUser && !this.acceptNewUsers) {
      reject('server is not accepting new users');
      return;
    }
    if (!isNewUser && this.users[username].connectionId !== undefined) {
      reject(`user ${username} is already linked to a connection`);
      return;
    }
    this.emit('authenticate', username, isNewUser, reject);
    if (rejected) {
      return;
    }
    this.logger('debug', `connection ${connectionId} accepted as ${username}`);
    const userAcceptedMessage: UserAcceptedMessage = { type: 'user/accepted' };
    this.sendTo(connectionId, userAcceptedMessage, false);
    if (isNewUser) {
      this.join(username);
    }
    this.link(connectionId, username);
  }
  private onLinkedConnectionMessage(username: string, message: FromConnectionMessage | Message) {
    switch (message.type) {
    case 'user/link':
    case 'user/unlink':
      this.unlink(username);
      break;
    case 'user/leave':
      this.leave(username);
      break;
    default:
      if (message.type.startsWith('user/')) {
        this.logger('warn', `${username} will be unlinked, because it send a ${message.type} message to the server, `
          + 'while this is not a known user message that can be sent to the server, keep in mind that user/* messages are reserved for '
          + 'internal use and should not be used for custom messages');
        this.unlink(username);
      } else {
        this.emit('message', username, message);
      }
      break;
    }
  }
  private onConnectionClosed(connectionId: string): void {
    this.logger('debug', `connection ${connectionId} closed`);
    const connection = this.connections[connectionId];
    if (connection.username !== undefined) {
      this.unlink(connection.username);
    }
    delete this.connections[connectionId];
  }

  public close(): void {
    this.canOnly('close', ['starting', 'listening']);
    this.status = 'closing';
    this.logger('info', 'server is closing');
    for (const username in this.users) {
      this.leave(username);
    }
    Object.values(this.connections).forEach(connection => { connection.socket.terminate(); });
    this.httpServer.close();
    this.httpServer.closeAllConnections();
  }
  private onServerClose(): void {
    this.status = 'closed';
    this.logger('info', 'server closed');
    this.emit('close');
  }

  private sendTo(connectionId: string, message: FromServerMessage | Message, isBroadcast: boolean) {
    const connection = this.connections[connectionId];
    /* istanbul ignore next */
    if (connection === undefined) {
      throw new Error(`cannot send ${message.type} message to connection ${connectionId}, as that connection does not exist`);
    }
    if (connection.socket.readyState === ws.WebSocket.OPEN) {
      const data = JSON.stringify({
        ...message,
        metadata: this.metadata ? { isBroadcast, timestamp: DateTime.now().toUTC().toISO() } : undefined,
      });
      connection.socket.send(data);
    } else {
      this.logger('debug', `could not send ${message.type} message to connection ${connectionId}, because the socket is not open`);
    }
  }
  public broadcast<TMessage extends Message>(message: TMessage, skipUsername?: string): void {
    this.canOnly('broadcast a message', ['listening', 'closing']);
    for (const username in this.users) {
      const { connectionId } = this.users[username];
      if (connectionId === undefined || username === skipUsername) {
        continue;
      }
      this.sendTo(connectionId, message, true);
    }
  }
  public send<TMessage extends Message>(username: string, message: TMessage): void {
    this.canOnly('send a message', ['listening', 'closing']);
    const user = this.users[username];
    if (user === undefined) {
      throw new Error('cannot send a message to a user that does not exist');
    }
    if (user.connectionId === undefined) {
      throw new Error('cannot send a message to a user that is not linked to a connection');
    }
    this.sendTo(user.connectionId, message, false);
  }

  public join(username: string): void {
    this.canOnly('join a user', 'listening');
    if (this.users[username] !== undefined) {
      throw new Error('cannot join a user that already exist');
    }
    if (!this.isValidUsername(username)) {
      throw new Error('cannot join a user with an invalid username');
    }
    this.logger('info', `${username} joined`);
    const userJoinedMessage: UserJoinedMessage = { type: 'user/joined', payload: { username } };
    this.broadcast(userJoinedMessage);
    this.users[username] = {};
    this.emit('join', username);
  }
  private link(connectionId: string, username: string): void {
    this.canOnly('link a connection to a user', 'listening');
    /* istanbul ignore next */
    if (this.users[username] === undefined) {
      throw new Error('cannot link a connection to a user that does not exist');
    }
    /* istanbul ignore next */
    if (this.connections[connectionId] === undefined) {
      throw new Error('cannot link a user to a connection that does not exist');
    }
    this.logger('info', `${username} linked`);
    this.users[username].connectionId = connectionId;
    this.connections[connectionId].username = username;
    Object.entries(this.users).forEach(([otherUsername, { connectionId: otherConnectionId }]) => {
      const joinedMessage: UserJoinedMessage = {
        type: 'user/joined',
        payload: { username: otherUsername },
      };
      this.sendTo(connectionId, joinedMessage, false);
      if (otherConnectionId !== undefined) {
        const linkedMessage: UserLinkedMessage = {
          type: 'user/linked',
          payload: { username: otherUsername },
        };
        this.sendTo(connectionId, linkedMessage, false);
      }
    });
    const userLinkedMessage: UserLinkedMessage = { type: 'user/linked', payload: { username } };
    this.broadcast(userLinkedMessage, username);
    this.emit('link', username);
  }
  public unlink(username: string): void {
    this.canOnly('unlink a connection from a user', ['listening', 'closing']);
    if (this.users[username] === undefined) {
      throw new Error('cannot unlink a connection from a user that does not exist');
    }
    const { connectionId } = this.users[username];
    if (connectionId === undefined) {
      throw new Error('cannot unlink a connection from a user that is not linked');
    }
    this.logger('info', `${username} unlinked`);
    const userUnlinkedMessage: UserUnlinkedMessage = { type: 'user/unlinked', payload: { username } };
    this.broadcast(userUnlinkedMessage);
    this.users[username].connectionId = undefined;
    this.connections[connectionId].username = undefined;
    this.emit('unlink', username);
  }
  public kick(username: string): void {
    this.canOnly('kick a user', 'listening');
    if (this.users[username] === undefined) {
      throw new Error('cannot kick a user that does not exist');
    }
    this.logger('info', `${username} kicked`);
    this.leave(username);
  }
  private leave(username: string): void {
    this.canOnly('leave a user', ['listening', 'closing']);
    /* istanbul ignore next */
    if (this.users[username] === undefined) {
      throw new Error('cannot leave a user that does not exist');
    }
    const { connectionId } = this.users[username];
    const userLeftMessage: UserLeftMessage = { type: 'user/left', payload: { username } };
    if (connectionId !== undefined) {
      this.unlink(username);
      this.sendTo(connectionId, userLeftMessage, true);
    }
    this.logger('info', `${username} left`);
    this.broadcast(userLeftMessage);
    delete this.users[username];
    this.emit('leave', username);
  }

  public getStatus(): Status {
    return this.status;
  }
  public getUsers(): User[] {
    return Object.entries(this.users).map(([username, { connectionId }]) => {
      return { username, isLinked: connectionId != undefined };
    });
  }
}
