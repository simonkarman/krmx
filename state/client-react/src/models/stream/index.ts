import { useSyncExternalStore } from 'react';
import { Message } from '@krmx/base';
import { Client } from '@krmx/client';
import { isStreamAppendMessage, StreamModel, StreamProps } from '@krmx/state';

/**
 * Register a stream model on this client using React hooks.
 *
 * @param client The client to register the stream model with.
 * @param domain The domain of the stream model.
 * @param model The stream model to register.
 * @param streamProps The props to spawn the stream model with.
 *
 * @returns An object with methods to use and dispatch events to the stream model.
 */
export const registerStream = <State>(client: Client, domain: string, model: StreamModel<State>, streamProps: StreamProps): {
  use: () => State,
  dispatch: (event: Message) => boolean,
} => {
  if (client.getStatus() === 'linked') {
    throw new Error(
      'registerStreamModel cannot be called with a client that is already linked to a user, as messages sent after linking but prior '
      + 'to the stream model being registered would be lost.',
    );
  }

  // State
  const stream = model.spawn(streamProps);
  let state = stream.initialState;
  stream.onOptimisticChange(s => { state = s; });

  // Create listeners
  type Listener = () => void;
  let listeners: Listener[] = [];
  function subscribe(listener: Listener) {
    listeners = [...listeners, listener];
    return () => {
      listeners = listeners.filter(l => l !== listener);
    };
  }

  // Emit the state to the external state
  function emit() {
    listeners.forEach(l => l());
  }

  // Reset state when the client itself unlinks
  const resetIfSelf = (username: string) => {
    if (username === client.getUsername()) {
      state = stream.initialState;
      stream.reset();
      emit();
    }
  };
  client.on('link', resetIfSelf);
  client.on('unlink', resetIfSelf);

  // Allow the state to be altered once stream appends are received
  client.on('message', (message) => {
    if (!isStreamAppendMessage(message) || message.payload.domain !== domain) {
      return;
    }
    const result = stream.dispatch(message.payload.dispatcher, message.payload.event);
    if (result !== true) {
      return;
    }
    emit();
  });

  const dispatch = (event: Message): boolean => {
    if (client.getStatus() !== 'linked') {
      return false;
    }

    // optimistic update
    const result = stream.dispatch(client.getUsername() || 'self', event, true);
    if (result !== true) {
      return false;
    }
    emit();

    // send the event to the server
    client.send({ ...event, type: `${domain}/${event.type}` });
    return true;
  };

  const use = () => {
    // Return the external state as synced with the client
    return useSyncExternalStore(subscribe, () => state, () => state);
  };

  return {
    use,
    dispatch,
  };
};
