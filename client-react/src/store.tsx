import { useEffect, useSyncExternalStore } from 'react';
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
  const unsubUnlink = client.on('unlink', resetIfSelf);

  // Allow the state to be altered once messages are received
  const unsubMessage = client.on('message', (message) => {
    state = reduceMessage(state, message);
    emit();
  });

  return () => {
    // Unsubscribe from the client when the component is unmounted
    useEffect(() => () => {
      unsubUnlink();
      unsubMessage();
    }, []);

    // Return the external state as synced with the client
    return useSyncExternalStore(subscribe, () => externalState, () => externalState);
  };
}
