import { useSyncExternalStore } from 'react';
import { Message } from '@krmx/base';
import { Client } from '@krmx/client';
import { Listener } from './utils';

export type MessageReducer<State> = (state: State, message: Message) => State;
export function createStore<State, ExternalState = State>(
  client: Client,
  initialState: State,
  reduceMessage: MessageReducer<State>,
  map: (state: State) => ExternalState,
): () => ExternalState {
  if (client.getStatus() === 'linked') {
    throw new Error('createStore cannot be called with a client that is already linked to a user, as messages sent after linking but prior to the'
      + ' store being created would be lost.');
  }

  // Create state
  let state: State = initialState;
  let externalState: ExternalState = map(state);

  // Create listeners
  let listeners: Listener[] = [];
  function subscribe(listener: Listener) {
    listeners = [...listeners, listener];
    return () => {
      listeners = listeners.filter(l => l !== listener);
    };
  }

  // Emit the state mapped to the external state
  function emit() {
    externalState = map(state);
    listeners.forEach(l => l());
  }

  // Reset state when the client itself unlinks
  const resetIfSelf = (username: string) => {
    if (username === client.getUsername()) {
      state = initialState;
      emit();
    }
  };
  client.on('unlink', resetIfSelf);

  // Allow the state to be altered once messages are received
  client.on('message', (message) => {
    state = reduceMessage(state, message);
    emit();
  });

  return () => {
    // Return the external state as synced with the client
    return useSyncExternalStore(subscribe, () => externalState, () => externalState);
  };
}
