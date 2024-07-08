import { VERSION } from './version';
import {
  EventEmitter, EventGenerator, FromServerMessage, Logger, LogSeverity,
  Message, User, MessageConsumer,
} from '@krmx/base';

/**
 * Status of a client.
 *
 * @description *initializing*: The client is initializing, but is not yet connected. This allows you to configure callbacks for the client before it
 *                              connects.
 * @description *connecting*:   The connect method of the client has been invoked, but the server is not yet listening.
 * @description *connected*:    The client is connected to the server and ready to link to a user.
 * @description *linking*:      The client is in the process of linking to a user.
 * @description *linked*:       The client is linked to a user and is ready to send and receive messages. This is the normal state the client should
 *                              be in during normal use.
 * @description *unlinking*:    The client is in the process of unlinking from a user.
 * @description *closing*:      The client is in the process of leaving or disconnecting from the server.
 * @description *closed*:       The client has closed its connection to the server.
 */
export type Status = 'initializing' | 'connecting' | 'connected' | 'linking' | 'linked' | 'unlinking' | 'closing' | 'closed';

/**
 * The events that the client can emit.
 */
export type Events = {
  /**
   * This event is emitted once the client starts connecting to the server.
   */
  connecting: [];

  /**
   * This event is emitted once the client has connected to the server.
   */
  connect: [];

  /**
   * This event is emitted once the connection to the server has closed.
   */
  close: [];

  /**
   * This event is emitted once the connection to the server is closing.
   */
  closing: [];

  /**
   * This event is emitted when the client has been accepted to link to a user.
   */
  accept: [];

  /**
   * This event is emitted when the client has been rejected to link to a user.
   */
  reject: [reason: string];

  /**
   * This event is emitted every time a user has joined.
   *
   * @param username The username of the user that joined.
   */
  join: [username: string];

  /**
   * This event is emitted every time a connection has linked to a user.
   *
   * @param username The username of the user that was linked to a connection.
   */
  link: [username: string];

  /**
   * This event is emitted once the client starts linking to a user.
   */
  linking: [];

  /**
   * This event is emitted every time a connection has unlinked from its user.
   *
   * @param username The username of the user that was unlinked from its connection.
   */
  unlink: [username: string];

  /**
   * This event is emitted once the client starts unlinking from its user.
   */
  unlinking: [];

  /**
   * This event is emitted every time a user has left.
   *
   * Note: A client will never receive a leave event for itself as it has already unlinked by the time the leave event is emitted.
   *
   * @param username The username of the user that left.
   */
  leave: [username: string];

  /**
   * This event is emitted every time the server sends a message to the client.
   *
   * @param message The content of the message that the server sent.
   */
  message: [message: Message];
}

/**
 * The client type describes the fields and methods that are accessible by using the createClient method.
 */
export type Client = {
  /**
   * Returns the current status of the Krmx client.
   */
  getStatus: () => Status,

  /**
   * Connect to the Krmx server.
   *
   * @param serverUrl For the serverUrl parameter you have to provide the `ws://` or `wss://` url of the websocket endpoint where your Krmx server is
   *                   running. For example: `ws://my-subdomain.example.org:3002/my-game` or `ws://localhost:1234`.
   */
  connect: (serverUrl: string) => Promise<void>,

  /**
   * Disconnect from the Krmx server. This only works when the client is connected but not yet linked. If force is passed, this will even disconnect
   *  when the client is linked to a user.
   *
   *  Example: `await client.unlink(); await client.disconnect();` or `await client.disconnect(true);`
   */
  disconnect: (force?: boolean) => Promise<void>,

  /**
   * Link the connection to a user.
   *
   * @param username The username of the user you want to link to. For example: 'simon'.
   * @param auth An optional auth string. This value is sent to the Krmx server and will be available in the `on('authenticate', ...)` listener.
   *
   * @throws Error Throws an error, if the client is not connected or the client is already linked to a user.
   */
  link: (username: string, auth?: string) => Promise<void>,

  /**
   * Unlink the connection from its user.
   *
   * @throws Error Throws an error, if the client is not connected or the client is not linked to a user.
   */
  unlink: () => Promise<void>,

  /**
   * Returns the username of the user to which the client is linked on the Krmx server.
   */
  getUsername: () => string | undefined,

  /**
   * Send a message to the Krmx server.
   *
   * @throws Error Throws an error, if the client is not connected or the client is not linked to a user.
   */
  send: MessageConsumer,

  /**
   * Sends a message to the Krmx server with an intent to leave. The Krmx server will gracefully disconnect the client and inform all other connected
   *  clients that the client intended to disconnect.
   */
  leave: () => Promise<void>,

  /**
   * Returns the available information of the users on the Krmx server.
   */
  getUsers: () => { username: string, isLinked: boolean }[],
} & EventEmitter<Events>;

/**
 * The properties with which to create the Client.
 */
export interface Props {
  /**
   * The logger that the Client should use. If set to false, no logs will be emitted.
   *
   * @default When not provided, it will log (non debug) to the standard console.
   */
  logger?: Logger | false;
}

/**
 * Create a new Client.
 * Note: This does not make the client connect to a Krmx server, you can do that using the `.connect(<url>)` method on the created object.
 *
 * @param props The properties with which the client should be initialized.
 */
export function createClient(props?: Props): Client {
  return ClientImpl.create(props);
}

class ClientImpl extends EventGenerator<Events> implements Client {
  private readonly logger: Logger;
  private socket: WebSocket | undefined;
  private username: string | undefined;

  private users: { [username: string]: { isLinked: boolean } } = {};
  private status: Status;
  private canOnly(action: string, when: Status[] | Status): void {
    const cannot = typeof when === 'string'
      ? when !== this.status
      : !when.includes(this.status);
    if (cannot) {
      throw new Error(`cannot ${action} when the client is ${this.status}`);
    }
  }

  private constructor(props?: Props) {
    super();
    if (props?.logger === false) {
      this.logger = () => { /*none*/ };
    } else {
      this.logger = props?.logger ?? ((severity: LogSeverity, ...args: unknown[]) => {
        severity !== 'debug' && console[severity](`[${severity}] [client]`, ...args);
      });
    }
    this.status = 'initializing';
  }
  static create(props?: Props): Client {
    return new ClientImpl(props);
  }

  public connect(serverUrl: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.canOnly('connect', ['initializing', 'closed']);
      this.status = 'connecting';
      this.emit('connecting');

      this.socket = new WebSocket(serverUrl);
      this.socket.onmessage = (rawMessage) => {
        const message: Message = JSON.parse(rawMessage.data.toString());
        if (message.type.startsWith('krmx/')) {
          const krmxMessage = message as FromServerMessage;
          this.onInternalMessage(krmxMessage);
        } else {
          if (this.status === 'linked') {
            this.emit('message', message);
          } else {
            this.logger('warn', `unexpectedly received a custom message ${message.type}, while the client is ${this.status}`);
          }
        }
      };
      let isConnecting = true;
      this.socket.onopen = () => {
        this.logger('debug', 'socket open');
        this.status = 'connected';
        this.emit('connect');
        if (isConnecting) {
          isConnecting = false;
          resolve();
        }
      };
      const close = () => {
        this.status = 'closed';
        this.socket = undefined;
        this.username = undefined;
        this.users = {};
        this.emit('close');
        if (isConnecting) {
          isConnecting = false;
          reject(new Error(`error while trying to connect to the server at ${serverUrl}`));
        }
      };
      this.socket.onerror = () => {
        this.logger('debug', 'socket error');
        close();
      };
      this.socket.onclose = () => {
        // TODO: evaluate reconnecting behaviour
        // if (!event.wasClean || this.status !== 'closing') {
        //   this.connect(serverUrl).catch(() => { /*none*/ });
        // }
        this.logger('debug', 'socket closed');
        close();
      };
    });
  }

  private onInternalMessage(krmxMessage: FromServerMessage) {
    switch (krmxMessage.type) {
    case 'krmx/rejected':
      this.status = 'connected';
      this.username = undefined;
      this.emit('reject', krmxMessage.payload.reason);
      break;
    case 'krmx/accepted':
      this.status = 'linked';
      this.users = {
        [this.username!]: { isLinked: true },
      };
      this.emit('accept');
      break;
    case 'krmx/joined':
      this.users[krmxMessage.payload.username] = {
        isLinked: krmxMessage.payload.username === this.username,
      };
      this.emit('join', krmxMessage.payload.username);
      break;
    case 'krmx/linked':
      this.users[krmxMessage.payload.username].isLinked = true;
      this.emit('link', krmxMessage.payload.username);
      break;
    case 'krmx/unlinked':
      this.users[krmxMessage.payload.username].isLinked = false;
      if (krmxMessage.payload.username === this.username) {
        this.status = 'connected';
        this.users = {};
      }
      this.emit('unlink', krmxMessage.payload.username);
      if (krmxMessage.payload.username === this.username) {
        this.username = undefined;
      }
      // The above code is confusing. Some fields are reset before and some after the emit. This is because the client should no longer be in the
      //  'linked' state as the event is emitted, but we do still require the username to be set, so that the listeners to the 'unlink' event can
      //  still check if this was a self unlink.
      // TODO: this confusion could be cleared up, if after unlinking, the server would emit a 'ready-to-(re)link' message. This would also mean the
      //        krmx/accepted message could be replaced with the krmx/ready-to-link message for consistency.
      break;
    case 'krmx/left':
      delete this.users[krmxMessage.payload.username];
      this.emit('leave', krmxMessage.payload.username);
      break;
    default:
      this.logger('warn', `unexpected krmx message ${JSON.stringify(krmxMessage)}`);
    }
  }

  public link(username: string, auth?: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.canOnly('link', 'connected');
      this.username = username;
      this.status = 'linking';
      this.emit('linking');

      const unsubLink = this.once('link', () => {
        // eslint-disable-next-line no-use-before-define
        unsubReject();
        resolve();
      });
      const unsubReject = this.once('reject', (reason) => {
        unsubLink();
        reject(new Error(reason));
      });
      this.socket?.send(JSON.stringify({ type: 'krmx/link', payload: { username, version: VERSION, auth } }));
    });
  }

  public unlink(): Promise<void> {
    return new Promise((resolve) => {
      this.canOnly('send', 'linked');
      this.status = 'unlinking';
      this.emit('unlinking');

      this.once('unlink', _ => resolve(), username => username === this.username);
      this.socket?.send(JSON.stringify({ type: 'krmx/unlink' }));
    });
  }

  public leave(): Promise<void> {
    return new Promise<void>((resolve) => {
      this.canOnly('leave', 'linked');
      this.status = 'connected';
      this.emit('unlinking');

      // Notice: even tho this is a 'leave' function, 'unlink' is correct here. This is because the 'unlink' event is the last we receive for
      //         ourselves. As after unlinking has taken place we will not receive any further messages, including the 'leave' message.
      this.once('unlink', _ => resolve(), username => username === this.username);
      this.socket?.send(JSON.stringify({ type: 'krmx/leave' }));
    });
  }

  public disconnect(force?: boolean): Promise<void> {
    return new Promise<void>((resolve) => {
      this.canOnly('disconnect', [
        'connected', 'linking', 'unlinking',
        ...(force ? ['connecting', 'linked', 'closing'] as const : []),
      ]);
      this.status = 'closing';
      this.username = undefined;
      this.emit('closing');

      this.once('close', resolve);
      this.socket?.close();
    });
  }

  public getStatus(): Status {
    return this.status;
  }

  public getUsername(): string | undefined {
    return this.username;
  }

  public getUsers(): User[] {
    return Object.entries(this.users).map(([username, { isLinked }]) => {
      return { username, isLinked };
    });
  }

  public send<TMessage extends Message>(message: TMessage): void {
    this.canOnly('send', 'linked');
    if (message.type.startsWith('krmx/')) {
      throw new Error('cannot send custom messages with type starting with the internal \'krmx/\' prefix');
    }
    this.socket?.send(JSON.stringify(message));
  }
}
