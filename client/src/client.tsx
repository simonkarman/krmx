import { configureStore, createSlice, PayloadAction } from '@reduxjs/toolkit';
import React, { createContext, FC, PropsWithChildren, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Provider, useDispatch, useSelector } from 'react-redux';
import WebSocket from 'isomorphic-ws';

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
export const krmxSlice = createSlice({
  name: 'user',
  initialState,
  reducers: {
    reset: (_, action: PayloadAction<{ username: string }>) => {
      return {
        username: action.payload.username,
        rejectionReason: undefined,
        isLinked: false,
        users: {},
        latestLeaveReason: undefined,
      };
    },
    accepted: (state) => {
      state.rejectionReason = undefined;
    },
    rejected: (state, action: PayloadAction<{ reason: string }>) => {
      state.rejectionReason = action.payload.reason;
    },
    joined: (state, action: PayloadAction<{ username: string }>) => {
      state.users[action.payload.username] = ({ isLinked: false });
    },
    linked: (state, action: PayloadAction<{ username: string }>) => {
      const username = action.payload.username;
      if (state.username === username) {
        state.isLinked = true;
      }
      state.users[username].isLinked = true;
    },
    unlinked: (state, action: PayloadAction<{ username: string }>) => {
      const username = action.payload.username;
      if (state.username === username) {
        state.isLinked = false;
      }
      state.users[username].isLinked = false;
    },
    left: (state, action: PayloadAction<{ username: string, reason: string }>) => {
      delete state.users[action.payload.username];
    },
  },
});

type MessageConsumer = <TMessage extends { type: string }>(message: TMessage) => void;
type KrmxContextProps = {
  isConnected: boolean,
  link: (username: string) => void,
  send: MessageConsumer,
  unlink: () => void,
  leave: () => void,
} & KrmxState;
const KrmxContext = createContext<KrmxContextProps>({
  isConnected: false,
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  krmxStateSelector: (state: any) => KrmxState;
}>> = (props) => {
  const ws = useRef(null as unknown as WebSocket);
  const [status, setStatus] = useState<'waiting' | 'open' | 'closed'>('waiting');
  const dispatch = useDispatch();

  const send: MessageConsumer = useCallback((message) => {
    if (status !== 'open') { return; }
    ws.current?.send(JSON.stringify(message));
  }, [status, ws]);

  const link = useCallback((username: string) => {
    if (status !== 'open') { return; }
    dispatch(krmxSlice.actions.reset({ username }));
    send({ type: 'user/link', payload: { username } });
  }, [status, send]);

  const unlink = useCallback(() => {
    if (status !== 'open') { return; }
    send({ type: 'user/unlink' });
  }, [status, send]);

  const leave = useCallback(() => {
    if (status !== 'open') { return; }
    send({ type: 'user/leave' });
  }, [status, send]);

  useEffect(() => {
    const socket = new WebSocket(props.serverUrl);
    socket.onerror = () => setStatus('closed');
    socket.onopen = () => {
      if (ws.current == socket) {
        setStatus('open');
      }
    };
    socket.onclose = () => {
      if (ws.current == socket) {
        dispatch(krmxSlice.actions.reset({ username: '' }));
        setStatus('closed');
      }
    };
    socket.onmessage = (rawMessage: { data: string | Buffer | ArrayBuffer | Buffer[] }) => {
      if (ws.current == socket) {
        const message: unknown = JSON.parse(rawMessage.data.toString());
        if (typeof message === 'object' && message !== null && message && 'type' in message && typeof message.type === 'string') {
          if (message.type.startsWith('user/')) {
            dispatch(message);
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
  }, [props]);

  const username = useSelector((state) => props.krmxStateSelector(state).username);
  const rejectionReason = useSelector((state) => props.krmxStateSelector(state).rejectionReason);
  const isLinked = useSelector((state) => props.krmxStateSelector(state).isLinked);
  const users = useSelector((state) => props.krmxStateSelector(state).users);
  return <KrmxContext.Provider value={{
    isConnected: status === 'open',
    username,
    rejectionReason,
    isLinked,
    users,
    link,
    send,
    unlink,
    leave,
  }}>
    {props.children}
  </KrmxContext.Provider>;
};

/**
 * Note: Don't use this if you are already creating a redux store in your app. In that case, add the krmxSlice to your store and use KrmxProvider
 *  directly.
 *
 * Usage
 * ```ts
 * const { KrmxProvider } = KrmxProviderWithStore();
 * function MyApp() {
 *   return (
 *     <KrmxProvider
 *       serverUrl={...}
 *       onMessage={(message) => console.info(message)}
 *     >
 *       <MyComponent/>
 *     </KrmxProvider>
 *   );
 * }
 * ```
 */
export function KrmxProviderWithStore(): { KrmxProvider: FC<PropsWithChildren<{serverUrl: string, onMessage: MessageConsumer}>>} {
  const krmxStore = configureStore({
    reducer: krmxSlice.reducer,
  });
  return {
    KrmxProvider: (props: PropsWithChildren<{serverUrl: string, onMessage: MessageConsumer}>) => {
      return (<Provider store={krmxStore}>
        <KrmxProvider krmxStateSelector={(state: KrmxState) => state} {...props}>
          {props.children}
        </KrmxProvider>
      </Provider>);
    },
  };
}
