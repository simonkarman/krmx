import { Delta, diff } from 'jsondiffpatch';
import { Message } from '@krmx/base';
import { z } from 'zod';
import { produce } from 'immer';
import { ActionDefinitions } from './model';

type ServerSubscription = (getDeltaFor: (username: string) => Delta | false, optimisticId: string | undefined) => void;

/**
 * A projection server is the server-side representation of the projection model. It is used to manage the state on the server side and allows for
 *  dispatching of actions to alter the state and notify all subscribers of the changes to the state in the for of projection deltas.
 */
export class ProjectionServer<State, Projection> {
  private subscriptions: ServerSubscription[] = [];

  constructor(
    private state: State,
    private readonly projectionMapper: (state: State, username: string) => Projection,
    private readonly actionDefinitions: ActionDefinitions<State, Projection>,
  ) {}

  /**
   * Dispatch an action to the server. The action will be applied to the state, and all subscribers will be notified with the updated projections.
   *
   * If the handler throws an error processing this action, the action will be considered as if it was successful but did not change the state.
   *
   * @param dispatcher The dispatcher of the action.
   * @param action The action to dispatch.
   * @param optimisticId An optional optimistic id to release. This is only used to pass to the subscribers.
   *
   * @returns An object with a success property. This is set to `true`, if the action was applied to the state. If the action type does not exist,
   *  the payload is invalid based on the schema of the definition for this action, or the handler of the action fails, then success will be `false`
   *  and the returned object will have an error property with the corresponding failure.
   */
  dispatch(dispatcher: string, action: Message, optimisticId?: string): { success: true } | { success: false, error: string | z.ZodError } {
    // get the definition corresponding to the dispatched action
    const definition = this.actionDefinitions[action.type];
    if (definition === undefined) {
      return { success: false, error: 'action type does not exist' };
    }

    // verify the payload is valid based on the schema of the definition for this action
    const payload = definition.payloadSchema.safeParse(action.payload);
    if (!payload.success) {
      return { success: false, error: payload.error };
    }

    // let's apply it to the source state (and reset the optimistic state to it)
    const previousState = this.state;
    try {
      this.state = produce(this.state, (_state: State) => {
        return definition.handler(_state, dispatcher, payload.data);
      });
    } catch (err) {
      // act as if this failed handler did not change the state
      return { success: false, error: 'error while applying action' };
    }

    // and broadcast changes to the source state
    this.subscriptions.forEach(subscription => {
      try {
        subscription((dispatcher: string) => {
          const delta = diff(
            this.projectionMapper(previousState, dispatcher),
            this.projectionMapper(this.state, dispatcher),
          );
          if (delta === undefined) {
            return false;
          }
          return delta;
        }, optimisticId);
      } catch (err) {
        // silently ignore errors in subscriptions
      }
    });
    return { success: true };
  }

  /**
   * Subscribe to updates on the state. The subscriber will be notified with a method to get the delta between the previous projection and the new
   *  projection of a specific dispatcher. The subscriber will also be notified with the optimistic id that was passed to the dispatch method.
   *
   * Note: The subscriber should call the method to get the delta for a specific dispatcher. That method returns false if there is no delta, in that
   *  case the subscriber should still inform that dispatcher to release the optimistic id manually using client.releaseOptimistic(optimisticId). If
   *  the method returns a delta, then the subscriber should apply the delta to the client including the optimistic id.
   *
   * @param subscription The subscription to add.
   */
  subscribe(subscription: ServerSubscription) {
    this.subscriptions.push(subscription);
  }

  /**
   * Get the projection of the state for a specific dispatcher.
   *
   * @param dispatcher The dispatcher to get the projection for.
   */
  projection(dispatcher: string) {
    return structuredClone(this.projectionMapper(this.state, dispatcher));
  }
}
