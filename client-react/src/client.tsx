import { useSyncExternalStore } from 'react';
import { Client, createClient, Props } from '@krmx/client';

type Listener = () => void;

/**
 * The state that is returned by the `useKrmx` hook.
 */
export type ClientState = {
  status: ReturnType<Client['getStatus']>,
  users: ReturnType<Client['getUsers']>,
  username: ReturnType<Client['getUsername']>,
};

/**
 * Create a client and a hook to use the Krmx Client in a React component.
 *
 * @param props The properties with which to create the Client.
 * @returns An object with the Krmx Client (`client`) and a hook to use the Krmx Client in a React component (`useKrmx`).
 */
export function createClientReact(props?: Props) {
  // Create client
  const client = createClient(props);
  client.all((eventName) => {
    if (eventName !== 'message') { emit(); }
  });

  // Create state and listeners
  let state: ClientState = {
    status: 'initializing',
    users: client.getUsers(),
    username: client.getUsername(),
  };
  let listeners: Listener[] = [];
  function subscribe(listener: Listener) {
    listeners = [...listeners, listener];
    return () => {
      listeners = listeners.filter(l => l !== listener);
    };
  }

  // Create emitter
  function emit() {
    state = {
      status: client.getStatus(),
      users: client.getUsers(),
      username: client.getUsername(),
    };
    listeners.forEach(l => l());
  }

  // Create useKrmx hook
  const useKrmx = () => {
    return useSyncExternalStore(subscribe, () => state, () => ({
      status: 'initializing',
      users: [],
      username: undefined,
    } as ClientState));
  };

  // Return the client and the useKrmx hook
  return {
    useKrmx,
    client,
  };
}

// TODO: add this back in as a generic createReactClientStore store
// export function createReactClientStore(client: Client) {
//   return undefined;
// }
// export const createLatestMessagesStore = (client: Client, numberOfMessages: number) => {
//   let listeners: Listener[] = [];
//   type State = { id: string, message: Message }[];
//   let state: State = [];
//   let messages: { id: string, message: Message }[] = [];
//   function emit() {
//     state = [...messages];
//     listeners.forEach(l => l());
//   }
//   function subscribe(listener: Listener) {
//     listeners = [...listeners, listener];
//     return () => {
//       listeners = listeners.filter(l => l !== listener);
//     };
//   }
//   client.on('message', (message) => {
//     messages = [...messages, { id: crypto.randomUUID(), message }].slice(-numberOfMessages);
//     emit();
//   });
//   const resetIfSelf = (username: string) => {
//     if (username === client.getUsername()) {
//       messages = [];
//       emit();
//     }
//   };
//   client.on('link', resetIfSelf);
//   client.on('unlink', resetIfSelf);
//   const useLatestKrmxMessages = () => {
//     return useSyncExternalStore(subscribe, () => state, () => ([] as State));
//   };
//   return { useLatestKrmxMessages };
// };
