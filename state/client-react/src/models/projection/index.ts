import { useSyncExternalStore } from 'react';
import { Client } from '@krmx/client';
import { Message } from '@krmx/base';
import {
  isProjectionDeltaMessage,
  isProjectionInvalidateMessage,
  isProjectionSetMessage,
  ProjectionActionMessage,
  ProjectionModel,
} from '@krmx/state';

const undefinedDispatcher = '<init>';

/**
 * Register a projection model on this client using React hooks.
 *
 * @param client The client to register the projection model with.
 * @param domain The domain of the projection model.
 * @param model The projection model to register.
 *
 * @returns An object with methods to use and dispatch actions to the projection model.
 */
export const registerProjection = <Projection>(client: Client, domain: string, model: ProjectionModel<unknown, Projection>): {
  use: () => Projection,
  dispatch: (action: Message) => boolean,
} => {
  if (client.getStatus() === 'linked') {
    throw new Error(
      'registerProjection cannot be called with a client that is already linked to a user, as messages sent after linking but prior '
      + 'to the projection client being registered would be lost.',
    );
  }

  // State
  const instance = model.spawnClient();
  let projection = model.spawnServer().projection(undefinedDispatcher);
  instance.subscribe(p => { projection = p; });

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

  // Reset state when the client itself (un)links
  const resetIfSelf = (username: string) => {
    if (username === client.getUsername()) {
      instance.set(model.spawnServer().projection(undefinedDispatcher));
      emit();
    }
  };
  client.on('link', resetIfSelf);
  client.on('unlink', resetIfSelf);

  // Allow the state to be altered once messages are received
  client.on('message', (message) => {
    // Handle set
    if (isProjectionSetMessage<Projection>(message) && message.payload.domain === domain) {
      // TODO: Should we validate the projection? (there is no (zod) schema available tho)
      instance.set(message.payload.projection);
      emit();
    }
    // Handle delta
    else if (isProjectionDeltaMessage(message) && message.payload.domain === domain) {
      try {
        instance.apply(message.payload.delta, message.payload.optimisticId);
        emit();
      } catch (e) {
        console.error('error while applying delta', e, message);
      }
    }
    // Handle invalidate
    else if (isProjectionInvalidateMessage(message) && message.payload.domain === domain) {
      instance.releaseOptimistic(message.payload.optimisticId);
      emit();
    }
  });

  const dispatch = (action: Message): boolean => {
    if (client.getStatus() !== 'linked') {
      return false;
    }

    // optimistic update
    const result = instance.optimistic(client.getUsername() || undefinedDispatcher, action);
    if (!result.success) {
      console.error(`Failed to send action ${action.type}`, result);
      return false;
    }
    emit();

    // send the action to the server
    client.send<ProjectionActionMessage>({
      type: 'projection/action',
      payload: {
        domain,
        action,
        optimisticId: result.optimisticId,
      },
    });
    return true;
  };

  const use = () => {
    // Return the external state as synced with the client
    return useSyncExternalStore(subscribe, () => projection, () => projection);
  };

  return {
    use,
    dispatch,
  };
};
