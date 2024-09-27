import { Message } from '@krmx/base';
import { z, ZodAny, ZodAnyDef, ZodType, ZodUndefined } from 'zod';
import { produce } from 'immer';
import { Delta, diff, patch } from 'jsondiffpatch';

type ActionDefinitions<State, View> = {
  [type: string]: {
    payloadSchema: ZodAny
    handler: <T extends State>(state: T, dispatcher: string, payload: ZodAnyDef) => T | void,
    optimisticHandler: (<T extends View>(view: T, dispatcher: string, payload: ZodAnyDef) => T | void) | undefined,
  }
};

type ClientSubscription<View> = (view: View) => void;

/**
 * A PatchedStatePatchEvent is a message that represents an event that has been dispatched to a PatchedStateClientInstance.
 */
export interface PatchedStatePatchEvent {
  type: 'ps/patch',
  payload: { domain: string, delta: Delta, optimisticId?: string | undefined },
}

/**
 * Verify that a message is a PatchedStatePatchEvent.
 *
 * @param message The message to check.
 */
export const isPatchedStatePatchEvent = (message: Message): message is PatchedStatePatchEvent => {
  return message.type === 'ps/patch'
    && typeof message.payload === 'object'
    && message.payload !== null
    && 'domain' in message.payload
    && typeof message.payload.domain === 'string'
    && 'delta' in message.payload
    && typeof message.payload.delta === 'object'
    && message.payload.delta !== null
    && (
      ('optimisticId' in message.payload && (typeof message.payload.optimisticId === 'string' || typeof message.payload.optimisticId === 'undefined'))
      || !('optimisticId' in message.payload)
    );
};

/**
 * A PatchedStateSetEvent is a message that represents an event that sets the view directly in a PatchedStateClientInstance.
 */
export interface PatchedStateSetEvent<View>{
  type: 'ps/set',
  payload: { domain: string, view: View },
}

/**
 * Verify that a message is a PatchedStatePatchEvent.
 *
 * @param message The message to check.
 */
export const isPatchedStateSetEvent = <View>(message: Message): message is PatchedStateSetEvent<View> => {
  return message.type === 'ps/set'
    && typeof message.payload === 'object'
    && message.payload !== null
    && 'domain' in message.payload
    && typeof message.payload.domain === 'string'
    && 'view' in message.payload;
};

/**
 * A PatchedStateReleaseEvent is a message that represents an event that releases an optimistic event in a PatchedStateClientInstance.
 */
export interface PatchedStateReleaseEvent {
  type: 'ps/release',
  payload: { domain: string, optimisticId: string },
}

/**
 * Verify that a message is a PatchedStateReleaseEvent.
 *
 * @param message The message to check.
 */
export const isPatchedStateReleaseEvent = (message: Message): message is PatchedStateReleaseEvent => {
  return message.type === 'ps/release'
    && typeof message.payload === 'object'
    && message.payload !== null
    && 'domain' in message.payload
    && typeof message.payload.domain === 'string'
    && 'optimisticId' in message.payload
    && typeof message.payload.optimisticId === 'string';
};

/**
 * A PatchedStateActionEvent is a message that represents an event that is sent from the client ot server with an action.
 */
export interface PatchedStateActionEvent {
  type: 'ps/action',
  payload: { domain: string, event: Message, optimisticId?: string },
}

/**
 * Verify that a message is a PatchedStateActionEvent.
 *
 * @param message The message to check.
 */
export const isPatchedStateActionEvent = (message: Message): message is PatchedStateActionEvent => {
  return message.type === 'ps/action'
    && typeof message.payload === 'object'
    && message.payload !== null
    && 'domain' in message.payload
    && typeof message.payload.domain === 'string'
    && (
      ('optimisticId' in message.payload && (typeof message.payload.optimisticId === 'string' || typeof message.payload.optimisticId === 'undefined'))
      || !('optimisticId' in message.payload)
    )
    && 'event' in message.payload
    && typeof message.payload.event === 'object'
    && message.payload.event !== null
    && 'type' in message.payload.event
    && typeof message.payload.event.type === 'string';
};

/**
 * A patched state client instance.
 *
 * This class is used to manage the view of the state on the client side. It allows for setting the view, applying patches to the view, and managing
 *  optimistic updates to the view.
 *
 * The view is updated through patches, which are deltas between the previous view and the new view. The view also supports optimistic updates, which
 *  are updates that are applied to the view before the server has confirmed the update to the state.
 */
class PatchedStateClientInstance<View> {
  private internalView: View;
  private optimisticView: View;
  private optimisticEvents: { optimisticId: string, dispatcher: string, event: Message }[] = [];

  private subscriptions: ClientSubscription<View>[] = [];

  constructor(
    private readonly actionDefinitions: ActionDefinitions<unknown, View>,
  ) {
    this.internalView = undefined as View;
    this.optimisticView = undefined as View;
  }

  private emit() {
    this.subscriptions.forEach(subscription => {
      try {
        subscription(this.view());
      } catch (err) {
        // silently ignore errors in subscriptions
      }
    });
  }

  /**
   * Set the view of the state. This will also set the optimistic view to the same view and clear any optimistic events. It will immediately notify
   *  all subscribers of the new view.
   *
   * @param view The view to set.
   */
  set(view: View) {
    this.internalView = view;
    this.optimisticView = structuredClone(view);
    this.optimisticEvents = [];
    this.emit();
  }

  private assertSet() {
    if (this.internalView === undefined) {
      throw new Error('cannot use client instance if no view has been set, please invoke clientInstance.set(...) first');
    }
  }

  /**
   * Apply a delta to the view. If an optimistic id is given, the optimistic event corresponding to that id will be released. Any remaining optimistic
   *  events are reapplied on top of the view. Then, all subscribers will be notified with the updated view.
   *
   * @param delta The delta to apply.
   * @param optimisticId An optional optimistic id to release.
   */
  apply(delta: Delta, optimisticId?: string): void {
    this.assertSet();

    // apply the delta to the view
    this.internalView = patch(this.internalView, delta) as View; // should have a ViewSchema to and validate after each patch??

    // if this resolved an optimistic id, remove optimistic update with the id that is just applied
    if (optimisticId !== undefined) {
      this.optimisticEvents = this.optimisticEvents.filter(e => e.optimisticId !== optimisticId);
    }

    // reapply optimistic events on top of view
    this.reapplyOptimisticEvents();
  }

  /**
   * Apply an optimistic event to the view. If the event type does not exist, or no optimistic handler is used for this event type, this method will
   *  return false. If the payload is invalid based on the schema of the action definition for this event, this method will return a ZodError. If the
   *  optimistic handler fails to apply the event to the view, this method will return false. Otherwise, the optimistic event will be applied to the
   *  optimistic view, and all subscribers will be notified with the updated view. The id of the optimistic event will be returned.
   *
   * Only if the optimistic event is confirmed by the server, the optimistic event should be released using the releaseOptimistic method. This happens
   *  automatically when the apply method is called with the optimistic id.
   *
   * @param dispatcher The dispatcher of the event.
   * @param event The event to dispatch.
   *
   * @returns Returns an object with a success prop, that is set to true or false. If true, the event can be sent to the server. If false, the error
   *  property (string or ZodError) will explain why it failed.
   */
  optimistic(dispatcher: string, event: Message) : { success: true, optimisticId?: string } | { success: false, error: string | z.ZodError } {
    this.assertSet();

    // get the action definition corresponding to the dispatched event
    const actionDefinition = this.actionDefinitions[event.type];
    // if it does not exist, or no optimistic handler is used for this event type, skip it
    if (actionDefinition === undefined) {
      return { success: false, error: 'event type does not exist' };
    }

    // verify the payload is valid based on the schema of the action definition for this event
    const payload = actionDefinition.payloadSchema.safeParse(event.payload);
    if (!payload.success) {
      return { success: false, error: payload.error };
    }

    // if no optimistic handler is used for this event type, skip it
    if (actionDefinition.optimisticHandler === undefined) {
      return { success: true, optimisticId: undefined };
    }

    // apply the optimistic event to the optimistic view
    try {
      this.optimisticView = produce(this.optimisticView, (_optimisticView: View) => {
        if (actionDefinition.optimisticHandler === undefined) {
          // this should never happen as events without an optimistic handler have already been filtered out
          return;
        }
        return actionDefinition.optimisticHandler(_optimisticView, dispatcher, payload.data);
      });
    } catch (err) {
      // act as if this failed optimistic handler did not change the view
      return { success: true, optimisticId: undefined };
    }

    // notify subscribers
    this.emit();

    // save (and return the id of) the optimistic event
    const optimisticId = 'opt0-' + crypto.randomUUID();
    this.optimisticEvents.push({ optimisticId, dispatcher, event });
    return { success: true, optimisticId };
  }

  private reapplyOptimisticEvents() {
    this.optimisticView = structuredClone(this.internalView);
    this.optimisticEvents.forEach(({ dispatcher, event }) => {
      try {
        this.optimisticView = produce(this.optimisticView, (_optimisticView: View) => {
          const actionDefinition = this.actionDefinitions[event.type];
          if (actionDefinition === undefined || actionDefinition.optimisticHandler === undefined) {
            return;
          }
          const payload = actionDefinition.payloadSchema.safeParse(event.payload);
          if (!payload.success) {
            return;
          }
          return actionDefinition.optimisticHandler(_optimisticView, dispatcher, payload.data);
        });
      } catch (err) {
        // act as if this failed optimistic handler did not change the view
      }
    });

    // notify subscribers
    this.emit();
  }

  /**
   * Release an optimistic event. This will remove the optimistic event with the given id from the list of optimistic events. Then, all remaining
   *  optimistic events are reapplied on top of the view. All subscribers will be notified with the updated view.
   * Note: This method will do nothing if the optimistic id does not exist.
   *
   * Only use this method if the optimistic event has been confirmed by the server. In normal use cases, the optimistic event should be released
   *  automatically when the apply method is called with the optimistic id. This method can be used in case an update does not result in a change to
   *  the view of this specific client.
   *
   * @param optimisticId The id of the optimistic event to release.
   */
  releaseOptimistic(optimisticId: string) {
    this.assertSet();

    this.optimisticEvents = this.optimisticEvents.filter(e => e.optimisticId !== optimisticId);
    this.reapplyOptimisticEvents();
  }

  /**
   * Subscribe to updates on the view. The subscriber will be notified with the view whenever the view changes.
   * Note: The view will always be the optimistic view if there are any optimistic events.
   *
   * @param subscription The subscription to add.
   */
  subscribe(subscription: ClientSubscription<View>) {
    this.subscriptions.push(subscription);
  }

  /**
   * Get the current view.
   * Note: The view will always be the optimistic view if there are any optimistic events.
   */
  view() {
    return structuredClone(this.optimisticView);
  }
}

type ServerSubscription = (getDeltaFor: (username: string) => Delta | false, optimisticId: string | undefined) => void;

/**
 * A patched state server instance.
 * This class is used to manage the state on the server side. It allows for dispatching events to alter the state and notify all subscribers of the
 *  changes to the state.
 */
class PatchedStateServerInstance<State, View> {
  private subscriptions: ServerSubscription[] = [];

  constructor(
    private state: State,
    private readonly viewMapper: (state: State, username: string) => View,
    private readonly actionDefinitions: ActionDefinitions<State, View>,
  ) {}

  /**
   * Dispatch an event to the server.  Otherwise, the event will be applied to the state, and all subscribers will be notified
   *  with the updated view.
   *
   * If the handler throws an error processing this event, the event will be considered as if it was successful but did not change the state.
   *
   * @param dispatcher The dispatcher of the event.
   * @param event The event to dispatch.
   * @param optimisticId An optional optimistic id to release. This is only used to pass to the subscribers.
   *
   * @returns `true` -- if the event was applied to the state. `false` -- if the event type does not exist. a ZodError -- if the payload is invalid
   *  based on the schema of the action definition for this event
   */
  dispatch(dispatcher: string, event: Message, optimisticId?: string): { success: true } | { success: false, error: string | z.ZodError } {
    // get the action definition corresponding to the dispatched event
    const actionDefinition = this.actionDefinitions[event.type];
    if (actionDefinition === undefined) {
      return { success: false, error: 'event type does not exist' };
    }

    // verify the payload is valid based on the schema of the action definition for this event
    const payload = actionDefinition.payloadSchema.safeParse(event.payload);
    if (!payload.success) {
      return { success: false, error: payload.error };
    }

    // let's apply it to the source state (and reset the optimistic state to it)
    const previousState = this.state;
    try {
      this.state = produce(this.state, (_state: State) => {
        return actionDefinition.handler(_state, dispatcher, payload.data);
      });
    } catch (err) {
      // act as if this failed handler did not change the state
      return { success: false, error: 'error while applying event' };
    }

    // and broadcast changes to the source state
    this.subscriptions.forEach(subscription => {
      try {
        subscription((dispatcher: string) => {
          const delta = diff(
            this.viewMapper(previousState, dispatcher),
            this.viewMapper(this.state, dispatcher),
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
   * Subscribe to updates on the state. The subscriber will be notified with a method to get the delta between the previous view and the new view of a
   *  specific dispatcher. The subscriber will also be notified with the optimistic id that was passed to the dispatch method.
   *
   * Note: The subscriber should call the method to get the delta for a specific dispatcher. That method returns false if there is no delta, in that
   *  case the subscriber should release the optimistic id manually using client.releaseOptimistic(optimisticId). If the method returns a delta, then
   *  the subscriber should apply the delta to the client including the optimistic id.
   *
   * @param subscription The subscription to add.
   */
  subscribe(subscription: ServerSubscription) {
    this.subscriptions.push(subscription);
  }

  /**
   * Get the view of the state for a specific dispatcher.
   *
   * @param dispatcher The dispatcher to get the view for.
   */
  view(dispatcher: string) {
    return structuredClone(this.viewMapper(this.state, dispatcher));
  }
}

/**
 * A Patched State represents a typesafe state and individual (possibly unique) views on top of that state, including the corresponding actions that
 *  can be taken to alter the original state and trigger updates on the views. The views are updated through patches, which are deltas between the
 *  previous view and the new view. The views also support optimistic updates, which are updates that are applied to the view before the server
 *  has confirmed the update to the state.
 *
 * Type safety is guaranteed using Zod, to safely mutate the views during optimistic updates Immer is used.
 *
 * Note: Keep in mind that the view should be safe to JSON decode and encode. Only use primitives, don't use classes, functions, or other complex
 *  types.
 *
 * Example usage
 * ```ts
 * const state = new PatchedState(
 *   // the initial state of the system
 *   { items: [{ owner: 'simon', value: 3 }, { owner: 'lisa', value: 4 }] },
 *   // the view mapper function
 *   (state, username) => ({
 *     yourItems: state.items.filter(item => item.owner === username),
 *     totalValue: state.items.reduce((sum, item) => sum + item.value, 0),
 *   }),
 * );
 * const inc = state.when(
 *   'increment',
 *   // payload schema
 *   z.number().int().min(1).max(5),
 *   // handler (ran server side only)
 *   (state, dispatcher, payload) => {
 *     state.items.forEach(item => {
 *       if (item.owner === dispatcher) {
 *         item.value += payload;
 *       }
 *     });
 *   },
 *   // optimistic handler (ran client side only)
 *   (view, _, payload) => {
 *     view.yourItems.forEach(item => {
 *       item.value += payload;
 *       view.totalValue += payload;
 *     });
 *   });
 *
 * // Spawn a server
 * const server = state.spawnServer();
 *
 * // Spawn a client
 * const client = state.spawnClient();
 * client.set(server.view('simon'));
 * server.subscribe((getDeltaFor, optimisticId) => {
 *   const delta = getDeltaFor('simon');
 *   if (delta === false) {
 *     optimisticId && client.releaseOptimistic(optimisticId);
 *     return;
 *   }
 *   client.apply(delta, optimisticId);
 * });
 *
 * // Dispatch an event
 * const event = inc(2);
 * const clientResult = client.optimistic('simon', event);
 * if (clientResult.success) {
 *   const serverResult = server.dispatch('simon', event, clientResult.optimisticId);
 *   if (!serverResult.success && clientResult.optimisticId) {
 *     client.releaseOptimistic(clientResult.optimisticId);
 *   }
 * }
 *
 * // Expect
 * // server.view('simon') === client.view();
 * ```
 *
 * Check the PatchedStateServerInstance, PatchedStateClientInstance and the tests for more examples.
 */
export class PatchedState<State, View> {
  private actionDefinitions: ActionDefinitions<State, View> = {};
  private immutable = false;

  /**
   * Creates a new patched state.
   *  State only lives on server, clients will receive a view on this state and can send actions to try to alter the server state. Clients will
   *   receive updates on their view on the state in the form of a delta.
   *
   * Note: Keep in mind that the view should be safe to JSON decode and encode. Only use primitives, don't use classes, functions, or other complex
   *  types.
   *
   * @param initialState The initial state.
   * @param viewMapper A function that maps the state to a view. This function will be called for each client whenever the state changes, and the
   *  changes from the previous view to the new view will be sent to the client in the form of a delta.
   */
  constructor(
    public readonly initialState: State,
    private readonly viewMapper: (state: State, username: string) => View,
  ) {}

  /**
   * Adds a new handler for when a specific type of event is dispatched.
   *
   * @param type The identifier of the event. This must be unique for this event source. For example: 'increment'
   * @param payloadSchema The Zod schema to use for the payload of the event. For example z.number().int().min(1).max(5)
   * @param handler The handler that applies the payload to the state. This method receives the state, the dispatcher, and the payload.
   * @param optimisticHandler An optional handler that immediately applies the payload to the view. This method receives the view, the dispatcher,
   *  and the payload.
   *
   * Note: In the handlers you can manipulate the state or view object directly (made possible by Immer) or return a new object from the handler.
   *
   * @returns Returns a constructor for creating type safe events.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  when<Type extends string, PayloadSchema extends ZodType<any, any, any>>(
    type: Type,
    payloadSchema: PayloadSchema,
    handler: (state: State, dispatcher: string, payload: z.infer<PayloadSchema>) => State | void,
    optimisticHandler?: (view: View, dispatcher: string, payload: z.infer<PayloadSchema>) => View | void,
  ):
    PayloadSchema extends ZodUndefined
      ? () => { type: Type, payload: undefined }
      : (payload: z.infer<PayloadSchema>) => { type: Type, payload: z.infer<PayloadSchema> } {
    // check if an event type is added after the server or client is spawned
    if (this.immutable) {
      throw new Error('cannot add new event types after spawning a server or client');
    }

    // check if the type is already in use
    if (this.actionDefinitions[type] !== undefined) {
      throw new Error(`event type ${type} is already in use`);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.actionDefinitions[type] = { payloadSchema, handler, optimisticHandler } as any;

    // @ts-expect-error as payload parameter could be undefined
    return (payload) => ({ type, payload });
  }

  /**
   * Spawns a new server instance.
   */
  spawnServer(): PatchedStateServerInstance<State, View> {
    this.immutable = true;
    return new PatchedStateServerInstance<State, View>(this.initialState, this.viewMapper, this.actionDefinitions);
  }

  /**
   * Spawns a new client instance.
   */
  spawnClient(): PatchedStateClientInstance<View> {
    this.immutable = true;
    return new PatchedStateClientInstance<View>(this.actionDefinitions);
  }
}
