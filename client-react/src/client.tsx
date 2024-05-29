import React, {
  createContext,
  FC,
  PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useReducer,
  useRef,
  useState,
} from 'react';
import { produce } from 'immer';
import { VERSION } from './version';

interface RejectedMessage { type: 'krmx/rejected', payload: { reason: string } }
interface AcceptedMessage { type: 'krmx/accepted' }
interface JoinedMessage { type: 'krmx/joined', payload: { username: string } }
interface LinkedMessage { type: 'krmx/linked', payload: { username: string } }
interface UnlinkedMessage { type: 'krmx/unlinked', payload: { username: string } }
interface LeftMessage { type: 'krmx/left', payload: { username: string } }
type FromServerMessage = RejectedMessage | AcceptedMessage | JoinedMessage |
  LinkedMessage | UnlinkedMessage | LeftMessage;

interface ResetAction { type: 'reset', payload: { username: string } }
type Action = ResetAction | FromServerMessage;

type KrmxState = {
  username: string;
  rejectionReason?: string;
  isLinked: boolean;
  users: { [username: string]: { isLinked: boolean}};
};
const reducer = (_state: KrmxState, action: Action) => {
  return produce<KrmxState, KrmxState>(_state, state => {
    const getResetState = (username: string) => ({
      username,
      isLinked: false,
      users: {},
    });
    switch (action.type) {
    case 'reset':
      return getResetState(action.payload.username);
    case 'krmx/accepted':
      state.rejectionReason = undefined;
      break;
    case 'krmx/rejected':
      state.rejectionReason = action.payload.reason;
      break;
    case 'krmx/joined':
      state.users[action.payload.username] = ({ isLinked: false });
      break;
    case 'krmx/linked':
      if (state.username === action.payload.username) {
        state.isLinked = true;
      }
      state.users[action.payload.username].isLinked = true;
      break;
    case 'krmx/unlinked':
      if (state.username === action.payload.username) {
        return getResetState(action.payload.username);
      }
      state.users[action.payload.username].isLinked = false;
      break;
    case 'krmx/left':
      delete state.users[action.payload.username];
      break;
    default:
      return state;
    }
  });
};

type MessageConsumer = <TMessage extends { type: string }>(message: TMessage) => void;

/**
 * The KrmxContextProps type describes the fields and methods that are accessible by using the useKrmx hook.
 */
export type KrmxContextProps = {
  /**
   * Indicates whether the KrmxProvider was able to successfully set up a websocket connection to the Krmx Server.
   */
  isConnected: boolean,
  /**
   * When invoked, makes the KrmxProvider retry setting up a websocket connection to the Krmx Server.
   *
   * By default, it will only attempt to reconnect if there is not already a connection to the Krmx server. If the force argument is set to true, it
   *  will even reconnect if it is currently already connected to the Krmx server. In that case, the current connection will be dropped first.
   */
  reconnect: (force?: boolean) => void,
  /**
   * When invoked, makes the KrmxProvider link the connection to a user.
   *
   * @param username The username of the user you want to link to. For example: 'simon'.
   * @param auth An optional auth string. This value is sent to the Krmx server and will be available in the `on('authenticate', ...)` listener.
   */
  link: (username: string, auth?: string) => void,
  /**
   * When invoked, makes the KrmxProvider send a message to the server.
   */
  send: MessageConsumer,
  /**
   * When invoked, makes the KrmxProvider unlink the connection from its user.
   */
  unlink: () => void,
  /**
   * When invoked, makes the KrmxProvider have the user leave the server.
   */
  leave: () => void,
  /**
   * Lets a component subscribe to incoming events from the Krmx server.
   *
   * @param messageConsumer The event handler that will be invoked every time that the Krmx server sends a message to this client. The event handler
   *                         is invoked with the message as the first parameter. Keep in mind that messages internal to Krmx, such as 'krmx/join' or
   *                         'krmx/leave' messages, are *NOT* emitted to this event handler.
   * @param deps The reactive dependency array (similar to useEffect). To avoid errors, you always have to pass an empty dependency array (aka []).
   *              More information: https://simonkarman.github.io/krmx/krmx-api/client#reactive-values-in-usemessages-event-handler
   */
  useMessages: (messageConsumer: MessageConsumer, deps: React.DependencyList) => void,
} & KrmxState;

const KrmxContext = createContext<KrmxContextProps | undefined>(undefined);

/**
 * The useKrmx hook allows a component to use the Krmx connection provided by a KrmxProvider component in the tree above it. When no KrmxProvider can
 *  be found, this function will throw an Error.
 *
 * Example: `const { isLinked, link, username } = useKrmx();`
 *
 * To find out which properties are returned by the useKrmx hook, please refer to the `KrmxContextProps` type.
 */
export const useKrmx = function (): KrmxContextProps {
  const ctx = useContext(KrmxContext);
  if (ctx === undefined) {
    throw new Error('useKrmx cannot be called without a KrmxProvider');
  }
  return ctx;
};

/**
 * The KrmxProvider component sets up a connection to a Krmx Server and exposes the usage of this connection to all components in the tree below it.
 *  The child components will be able to use the Krmx context. For example to access whether the connection is successful, to link or unlink the
 *  connection from a user, and/or to send and receive messages.
 *
 * Example: `<KrmxProvider serverUrl={"ws://localhost:1234"}><MyComponentUsingKrmx /></KrmxProvider>`
 *
 * To use Krmx state in your components, please refer to the useKrmx hook.
 *
 * @param props The props define how the connection to the Krmx Server should be setup. Currently, the only property you can provide is the
 *               `serverUrl`. For the serverUrl property you have to provide the ws:// or wss:// url of the websocket endpoint where your Krmx server
 *               is running. For example: `ws://my-subdomain.example.org:3002/my-game` or `ws://localhost:1234`.
 * @constructor
 */
export const KrmxProvider: FC<PropsWithChildren<{
  serverUrl: string,
}>> = (props) => {
  const ws = useRef(null as unknown as WebSocket);
  const subscriptions = useRef<{ [subscriptionId: string]: MessageConsumer }>({});

  const [connectionAttempt, setConnectionAttempt] = useState(0);
  const [status, setStatus] = useState<'waiting' | 'open' | 'closed'>('waiting');
  const [state, dispatch] = useReducer(reducer, {
    username: '',
    isLinked: false,
    users: {},
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as unknown as any);

  const useMessages = (messageConsumer: MessageConsumer, deps: React.DependencyList) => {
    if (deps === undefined || deps.length !== 0) {
      const docs = 'https://simonkarman.github.io/krmx/krmx-api/client#reactive-values-in-usemessages-event-handler';
      throw new Error(`useMessages must be used with an empty dependency list (aka '[]'), consult the documentation for more information: ${docs}.`);
    }
    const onMessage = useCallback(messageConsumer, deps);
    useEffect(() => {
      const subscriptionId = crypto.randomUUID();
      subscriptions.current[subscriptionId] = onMessage;
      return () => {
        delete subscriptions.current[subscriptionId];
      };
    }, [onMessage, ws]);
  };

  const send: MessageConsumer = useCallback((message) => {
    if (status !== 'open') { return; }
    ws.current?.send(JSON.stringify(message));
  }, [status, ws]);

  const link = useCallback((username: string, auth?: string) => {
    if (status !== 'open') { return; }
    dispatch({ type: 'reset', payload: { username } });
    send({ type: 'krmx/link', payload: { username, version: VERSION, auth } });
  }, [status, send]);

  const unlink = useCallback(() => {
    if (status !== 'open') { return; }
    send({ type: 'krmx/unlink' });
  }, [status, send]);

  const leave = useCallback(() => {
    if (status !== 'open') { return; }
    send({ type: 'krmx/leave' });
  }, [status, send]);

  useEffect(() => {
    const connectionAttemptSuffix = `${props.serverUrl.includes('?') ? '&' : '?'}connectionAttempt=${connectionAttempt}`;
    const socket = new WebSocket(`${props.serverUrl}${connectionAttemptSuffix}`);
    socket.onerror = () => {
      if (ws.current == socket) {
        setStatus('closed');
      }
    };
    socket.onopen = () => {
      if (ws.current == socket) {
        setStatus('open');
        // On reconnect, when based on the state we're expected to be linked, immediately link!
        if (state.isLinked && state.username !== '') {
          link(state.username);
        }
      }
    };
    socket.onclose = () => {
      if (ws.current == socket) {
        dispatch({ type: 'reset', payload: { username: '' } });
        setStatus('closed');
      }
    };
    socket.onmessage = (rawMessage: { data: string | Buffer | ArrayBuffer | Buffer[] }) => {
      if (ws.current == socket) {
        const message: unknown = JSON.parse(rawMessage.data.toString());
        if (typeof message === 'object' && message !== null && message && 'type' in message && typeof message.type === 'string') {
          if (message.type.startsWith('krmx/')) {
            dispatch(message as FromServerMessage);
          } else {
            for (const [id, messageConsumer] of Object.entries(subscriptions.current)) {
              try {
                messageConsumer(message as { type: string });
              } catch (e) {
                console.error(`useKrmx/useMessages invocation (${id}) failed`, e);
              }
            }
          }
        }
      }
    };
    ws.current = socket;
    return () => {
      socket.close();
    };
  }, [props, connectionAttempt]);

  const reconnect = (force = false) => {
    if (force || status !== 'open') {
      setConnectionAttempt(connectionAttempt + 1);
    }
  };

  return <KrmxContext.Provider value={{
    isConnected: status === 'open',
    reconnect,
    username: state.username,
    rejectionReason: state.rejectionReason,
    isLinked: state.isLinked,
    users: state.users,
    link,
    send,
    unlink,
    leave,
    useMessages,
  }}>
    {props.children}
  </KrmxContext.Provider>;
};
