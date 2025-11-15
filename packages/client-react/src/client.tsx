import { useSyncExternalStore } from 'react';
import { User } from '@krmx/base';
import { createClient as createKrmxClient, Props, Status } from '@krmx/client';
import { Listener } from './utils';

/**
 * The state that is returned by the `useClient` hook.
 */
export type ClientState = {
  status: Status,
  users: User[],
  username: string | undefined,
};

const snapshot: ClientState = {
  status: 'initializing',
  users: [],
  username: undefined,
};

/**
 * Create a client and a hook to get the Krmx Client status in a React component.
 *
 * @param props The properties with which to create the Krmx Client.
 * @returns An object with the Krmx Client (`client`) and a hook to use the Krmx Client in a React component (`useClient`).
 */
export function createClient(props?: Props) {
  // Create client
  const client = createKrmxClient(props);
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

  // Create useClient hook
  const useClient = (): ClientState => {
    // Return the state as synced with the client
    return useSyncExternalStore(subscribe, () => state, () => snapshot);
  };

  // Return the client and the useClient hook
  return {
    client,
    useClient,
  };
}
