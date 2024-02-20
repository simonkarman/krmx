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

export type KrmxState = {
  username: string;
  rejectionReason?: string;
  isLinked: boolean;
  users: { [username: string]: { isLinked: boolean}};
};
const initialState: KrmxState = {
  username: '',
  isLinked: false,
  users: {},
};
const reducer = (_state: KrmxState, action: Action) => {
  return produce<KrmxState, KrmxState>(_state, state => {
    switch (action.type) {
    case 'reset':
      return {
        username: action.payload.username,
        isLinked: false,
        users: {},
      };
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
        state.isLinked = false;
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
type KrmxContextProps = {
  isConnected: boolean,
  reconnect: (force?: boolean) => void,
  link: (username: string) => void,
  send: MessageConsumer,
  unlink: () => void,
  leave: () => void,
} & KrmxState;
const KrmxContext = createContext<KrmxContextProps>({
  isConnected: false,
  reconnect: () => {},
  isLinked: false,
  username: '',
  rejectionReason: undefined,
  users: {},
  link: () => {},
  send: () => {},
  unlink: () => {},
  leave: () => {},
});
export const useKrmx = function () {
  return useContext(KrmxContext);
};

export const KrmxProvider: FC<PropsWithChildren<{
  serverUrl: string,
  onMessage: MessageConsumer,
}>> = (props) => {
  const ws = useRef(null as unknown as WebSocket);
  const [connectionAttempt, setConnectionAttempt] = useState(0);
  const [status, setStatus] = useState<'waiting' | 'open' | 'closed'>('waiting');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [state, dispatch] = useReducer(reducer, initialState as unknown as any);

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
            props.onMessage(message as { type: string });
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
  }}>
    {props.children}
  </KrmxContext.Provider>;
};
