import { useSyncExternalStore } from 'react';
import { Message } from '@krmx/base';
import { Client, createClient } from '@krmx/client';

export type Listener = () => void;

export const createReactClient = () => {
  // Create client
  const client = createClient();
  client.all((eventName) => {
    if (eventName !== 'message') { emit(); }
  });

  // Create listeners
  let listeners: Listener[] = [];
  type State = {
    status: ReturnType<Client['getStatus']>,
    users: ReturnType<Client['getUsers']>,
    username: ReturnType<Client['getUsername']>,
  };
  let state: State = {
    status: 'initializing',
    users: client.getUsers(),
    username: client.getUsername(),
  };
  function emit() {
    state = {
      status: client.getStatus(),
      users: client.getUsers(),
      username: client.getUsername(),
    };
    listeners.forEach(l => l());
  }
  function subscribe(listener: Listener) {
    listeners = [...listeners, listener];
    return () => {
      listeners = listeners.filter(l => l !== listener);
    };
  }

  // Create hooks
  const useKrmx = () => {
    return useSyncExternalStore(subscribe, () => state, () => ({
      status: 'initializing',
      users: [],
      username: undefined,
    } as State));
  };

  return {
    useKrmx,
    client,
  };
};

export const createLatestMessagesStore = (client: Client, numberOfMessages: number) => {
  let listeners: Listener[] = [];
  type State = { id: string, message: Message }[];
  let state: State = [];
  let messages: { id: string, message: Message }[] = [];
  function emit() {
    state = [...messages];
    listeners.forEach(l => l());
  }
  function subscribe(listener: Listener) {
    listeners = [...listeners, listener];
    return () => {
      listeners = listeners.filter(l => l !== listener);
    };
  }
  client.on('message', (message) => {
    messages = [...messages, { id: crypto.randomUUID(), message }].slice(-numberOfMessages);
    emit();
  });
  const resetIfSelf = (username: string) => {
    if (username === client.getUsername()) {
      messages = [];
      emit();
    }
  };
  client.on('link', resetIfSelf);
  client.on('unlink', resetIfSelf);
  const useLatestKrmxMessages = () => {
    return useSyncExternalStore(subscribe, () => state, () => ([] as State));
  };
  return { useLatestKrmxMessages };
};
