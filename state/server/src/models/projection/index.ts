import { Server } from '@krmx/server';
import { Message } from '@krmx/base';
import { isProjectionActionMessage, ProjectionDeltaMessage, ProjectionInvalidateMessage, ProjectionModel, ProjectionSetMessage } from '@krmx/state';

/**
 * Register the projection to the server.
 *
 * @param server The server to register the projection model on.
 * @param domain The domain of the projection model.
 * @param model The model to register.
 *
 * @returns An object with methods to unregister, and get projections and to dispatch actions to the model.
 */
export const registerProjection = <View>(
  server: Server,
  domain: string,
  model: ProjectionModel<unknown, View>,
) => {
  const instance = model.spawnServer();

  // Whenever the internal state changes...
  instance.subscribe((getDeltaFor, optimisticId) => {
    // For each user...
    server.getUsers().forEach((user) => {
      // We don't have to send delta's to users that are not linked
      if (!user.isLinked) {
        return;
      }

      // Compute the data for the user
      const delta = getDeltaFor(user.username);
      if (delta === false) {
        // If there is no delta, we only need to invalidate the optimistic action for that client
        // TODO: we should only do this if the optimisticId originated from this user, how should we detect this?
        if (optimisticId) {
          server.send<ProjectionInvalidateMessage>(user.username, {
            type: 'projection/invalidate',
            payload: { domain, optimisticId },
          });
        }
        return;
      }

      // Send the delta to the user
      server.send<ProjectionDeltaMessage>(user.username, {
        type: 'projection/delta',
        payload: {
          domain,
          delta,
          optimisticId,
        },
      });
    });
  });

  // When users link, send them their current projection on the state
  const linkOff = server.on('link', (username) => {
    server.send<ProjectionSetMessage<View>>(username, {
      type: 'projection/set',
      payload: {
        domain,
        projection: instance.projection(username),
      },
    });
  });

  // Allow dispatching an action
  const dispatch = (dispatcher: string, action: Message, optimisticId?: string): { success: false, error: unknown } | { success: true } => {
    const result = instance.dispatch(dispatcher, action, optimisticId);
    if (!result.success && optimisticId) {
      // If the action could not be dispatched, something must have been wrong with the action
      // Therefor invalidate the optimistic action at that client (if the client is linked)
      if (server.getUsers().find(u => u.username === dispatcher)?.isLinked) {
        server.send<ProjectionInvalidateMessage>(dispatcher, {
          type: 'projection/invalidate',
          payload: { domain, optimisticId },
        });
      }
    }
    return result;
  };

  // When a client sends a projection action for this domain, dispatch it
  const messageOff = server.on('message', (username, message) => {
    if (isProjectionActionMessage(message) && message.payload.domain === domain) {
      dispatch(username, message.payload.action, message.payload.optimisticId);
    }
  });

  return {
    /**
     * Unregister this model from the server.
     */
    unregister: () => {
      messageOff();
      linkOff();
    },

    /**
     * Dispatch an action to the state.
     */
    dispatch,

    /**
     * Get projection for a specific user.
     */
    projection: instance.projection,
  };
};
