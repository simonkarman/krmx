import { Message } from '@krmx/base';
import { Delta, patch } from 'jsondiffpatch';
import { z } from 'zod';
import { produce } from 'immer';
import { ActionDefinitions } from './model';
import { Random } from '../../utils';

type ClientSubscription<Projection> = (projection: Projection) => void;

/**
 * A projection client is the client-side representation of the projection model. It is used to manage the projection of the state on the client side.
 *  It allows for setting the projection, applying deltas to the projection, and managing optimistic updates to the projection.
 */
export class ProjectionClient<Projection> {
  private random: Random;

  private internalProjection: Projection;
  private optimisticProjection: Projection;
  private optimisticActions: { optimisticId: string, dispatcher: string, action: Message }[] = [];

  private subscriptions: ClientSubscription<Projection>[] = [];

  constructor(
    private readonly actionDefinitions: ActionDefinitions<unknown, Projection>,
  ) {
    this.internalProjection = undefined as Projection;
    this.optimisticProjection = undefined as Projection;
    this.random = undefined as unknown as Random;
  }

  private emit(): void {
    this.subscriptions.forEach(subscription => {
      try {
        subscription(this.projection());
      } catch (err) {
        // silently ignore errors in subscriptions
      }
    });
  }

  /**
   * Set the projection. This will also reset the optimistic projection and clears any optimistic actions. It will immediately notify all subscribers
   *  of the new projection.
   *
   * @param projection The projection to set.
   */
  set(projection: Projection): void {
    this.random = new Random('a' + Date.now().toString(36) + JSON.stringify(projection));

    this.internalProjection = projection;
    this.optimisticProjection = structuredClone(projection);
    this.optimisticActions = [];

    this.emit();
  }

  private assertSet(): void {
    if (this.internalProjection === undefined) {
      throw new Error('cannot use client if no projection has been set, please invoke client.set(...) first');
    }
  }

  /**
   * Apply a delta to the projection. If an optimistic id is given, the optimistic action corresponding to that id will be released. Any remaining
   *  optimistic actions are reapplied on top of the projection. Then, all subscribers will be notified with the updated projection.
   *
   * @param delta The delta to apply.
   * @param optimisticId An optional optimistic id to release.
   */
  apply(delta: Delta, optimisticId?: string): void {
    this.assertSet();

    // patch the projection with the delta
    this.internalProjection = patch(this.internalProjection, delta) as Projection;

    // if this resolved an optimistic id, remove optimistic action with the that id
    if (optimisticId !== undefined) {
      this.optimisticActions = this.optimisticActions.filter(e => e.optimisticId !== optimisticId);
    }

    // reapply optimistic actions on top of projection
    this.reapplyOptimisticActions();
  }

  /**
   * Apply an optimistic action to the projection.The optimistic action will be applied to the optimistic projection, and all subscribers will be
   *  notified with the updated projection. The id of the optimistic action will be returned.
   *
   * Only if the optimistic action is confirmed by the server, the optimistic action should be released using the releaseOptimistic method. This
   *  happens automatically when the apply method is called with the optimistic id.
   *
   * @param dispatcher The dispatcher of the action.
   * @param action The action to dispatch.
   *
   * @returns Returns an object with a success prop, that is set to true or false. If true, the action should be sent to the server. If false, the
   *  error property (string or ZodError) will explain why it failed.
   */
  optimistic(dispatcher: string, action: Message): { success: true, optimisticId?: string }
    | { success: false, error: 'action type does not exist' | z.ZodError } {
    this.assertSet();

    // get the definition corresponding to the dispatched action
    const definition = this.actionDefinitions[action.type];
    // if it does not exist, skip it
    if (definition === undefined) {
      return { success: false, error: 'action type does not exist' };
    }

    // verify the payload is valid based on the schema of the definition for this action
    const payload = definition.payloadSchema.safeParse(action.payload);
    if (!payload.success) {
      return { success: false, error: payload.error };
    }

    // if no optimistic handler is used for this action type, skip it
    if (definition.optimisticHandler === undefined) {
      return { success: true, optimisticId: undefined };
    }

    // apply the optimistic action to the optimistic projection
    try {
      this.optimisticProjection = produce(this.optimisticProjection, (_optimisticProjection: Projection) => {
        if (definition.optimisticHandler === undefined) {
          // this should never happen as actions without an optimistic handler have already been filtered out
          return;
        }
        return definition.optimisticHandler(_optimisticProjection, dispatcher, payload.data);
      });
    } catch (err) {
      // act as if this failed optimistic handler did not change the projection
      return { success: true, optimisticId: undefined };
    }

    // notify subscribers
    this.emit();

    // save (and return the id of) the optimistic action
    const optimisticId = 'opt0-' + this.random.string(10);
    this.optimisticActions.push({ optimisticId, dispatcher, action });
    return { success: true, optimisticId };
  }

  private reapplyOptimisticActions(): void {
    this.optimisticProjection = structuredClone(this.internalProjection);
    this.optimisticActions.forEach(({ dispatcher, action }) => {
      try {
        this.optimisticProjection = produce(this.optimisticProjection, (_optimisticProjection: Projection) => {
          const actionDefinition = this.actionDefinitions[action.type];
          if (actionDefinition === undefined || actionDefinition.optimisticHandler === undefined) {
            return;
          }
          const payload = actionDefinition.payloadSchema.safeParse(action.payload);
          if (!payload.success) {
            return;
          }
          return actionDefinition.optimisticHandler(_optimisticProjection, dispatcher, payload.data);
        });
      } catch (err) {
        // act as if this failed optimistic handler did not change the projection
      }
    });

    // notify subscribers
    this.emit();
  }

  /**
   * Release an optimistic action. This will remove the optimistic action with the given id from the list of optimistic actions. Then, all remaining
   *  optimistic actions are reapplied on top of the projection. All subscribers will be notified with the updated projection.
   *
   * Note: This method will do nothing if the optimistic id does not exist.
   *
   * Only use this method if the optimistic action has been invalidated by the server. In normal use cases, the optimistic action should be
   *  invalidated automatically when the apply method is called with the optimistic id. This method can be used in case an update does not result in a
   *  change to the projection of this specific client or if the server denied the action for any reason.
   *
   * @param optimisticId The id of the optimistic action to release.
   */
  releaseOptimistic(optimisticId: string): void {
    this.assertSet();

    this.optimisticActions = this.optimisticActions.filter(e => e.optimisticId !== optimisticId);
    this.reapplyOptimisticActions();
  }

  /**
   * Subscribe to updates on the projection. The subscriber will be notified with the projection whenever the projection changes.
   *
   * Note: The projection will always be the optimistic projection, if there are any optimistic actions.
   *
   * @param subscription The subscription to add.
   */
  subscribe(subscription: ClientSubscription<Projection>): void {
    this.subscriptions.push(subscription);
  }

  /**
   * Get the current projection.
   * Note: The projection will always be the optimistic projection, if there are any optimistic actions.
   */
  projection(): Projection {
    return structuredClone(this.optimisticProjection);
  }
}
