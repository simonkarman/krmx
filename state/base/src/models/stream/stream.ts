import { z, ZodAnyDef } from 'zod';
import { produce } from 'immer';
import { EventDefinitions } from './model';

type Subscription<State> = (state: State) => void;

/**
 * The StreamModelProps are used to configure a StreamModel.
 */
export type StreamProps = {
  /**
   * The number of seconds an optimistic dispatched event should be kept in memory. If it is not verified before this time, the event will expire
   *  and the optimistic state will no longer reflect the expired event.
   */
  optimisticSeconds: number;
}

/**
 * A stream is the implementation of the stream model.
 */
export class Stream<State> {
  private sourceState: State;
  private subscriptions: Subscription<State>[] = [];

  private optimisticEvents: { hash: string, dispatcher: string, event: { type: string, payload: unknown }, timestamp: number }[] = [];
  private optimisticState: State;
  private optimisticSubscriptions: Subscription<State>[] = [];

  constructor(
    public readonly initialState: State,
    private readonly actionDefinitions: EventDefinitions<State>,
    public readonly props: StreamProps,
  ) {
    this.sourceState = initialState;
    this.optimisticState = this.sourceState;
  }

  /**
   * Resets the state to the initial state and clears out any optimistic events.
   */
  reset(): void {
    // hard reset state to initial state
    this.sourceState = this.initialState;

    // flush all optimistic events
    this.optimisticEvents = [];
    this.optimisticState = this.sourceState;

    // publish reset to subscribers
    [ ...this.subscriptions,
      ...this.optimisticSubscriptions,
    ].forEach(subscription => subscription(this.sourceState));
  }

  /**
   * Dispatches an event to the stream on behalf of a dispatcher.
   *
   * First, the event is parsed. Then, the event is applied to the state by invoking the handler corresponding to the event type.
   *
   * @param dispatcher The name or identifier of the entity by which this event was dispatched, which can be referenced in the handler
   * @param event The event (type and payload) to dispatch
   * @param isOptimistic Optionally, provides whether this is an optimistic dispatch. Default is `false`. If `true`, then only the optimistic state is
   *  altered. Until the same event is verified (dispatched with isOptimistic set to false), the update will only be reflected in the optimistic
   *  state. If the event is not verified before `EventSource.optimisticSeconds` time has passed, the event is discarded and also removed from the
   *  optimistic state.
   *
   * @return boolean | z.ZodError Returns `true` if the event successfully dispatched. Returns `false` when the event type does not exist.
   *  Returns a ZodError if the event payload doesn't match the corresponding payload schema.
   */
  dispatch(dispatcher: string, event: { type: string, payload?: unknown }, isOptimistic = false): boolean | z.ZodError {
    const generateHashOfEvent = () => {
      return `${dispatcher}|${JSON.stringify(event)}`;
    };

    // get the action definition corresponding to the dispatched event
    const definition = this.actionDefinitions[event.type];
    if (definition === undefined) {
      return false;
    }

    // verify the payload is valid based on the schema of the action definition for this event
    const payload = definition.payloadSchema.safeParse(event.payload);
    if (!payload.success) {
      return payload.error;
    }

    // first, we can prune all optimistic updates that are too old and are thus no longer relevant
    const now = Date.now();
    this.optimisticEvents = this.optimisticEvents.filter(event => now < event.timestamp);

    if (isOptimistic) {
      // if optimistic -- this state change might happen in the future

      // so, leave the source state as is and only update the optimistic state
      try {
        this.optimisticState = produce(this.optimisticState, (_state: State) => {
          return definition.handler(_state, dispatcher, payload.data);
        });
      } catch (err) {
        // act as if this failed handler did not change the state
      }

      // and save the dispatched event in a list for future reference
      const MILLISECONDS_IN_ONE_SECOND = 1000;
      this.optimisticEvents.push({
        hash: generateHashOfEvent(),
        dispatcher,
        event: { type: event.type, payload: payload.data },
        timestamp: Date.now() + (MILLISECONDS_IN_ONE_SECOND * this.props.optimisticSeconds),
      });
    } else {
      // if non-optimistic -- this state change has been verified to actually happen

      // so, let's apply it to the source state (and reset the optimistic state to it)
      try {
        this.sourceState = produce(this.sourceState, (_state: State) => {
          return definition.handler(_state, dispatcher, payload.data);
        });
      } catch (err) {
        // act as if this failed handler did not change the state
      }
      this.optimisticState = this.sourceState;

      // and broadcast changes to the source state
      this.subscriptions.forEach(subscription => {
        try {
          subscription(this.sourceState);
        } catch (err) {
          // silently ignore errors in subscriptions
        }
      });

      // now, if there are any optimistic updates ...
      if (this.optimisticEvents.length > 0) {

        // if the event we just applied to the source state is in the optimistic list, remove it, as it has actually happened!
        const _hash = generateHashOfEvent();
        const index = this.optimisticEvents.findIndex(event => event.hash === _hash);
        if (index !== -1) {
          this.optimisticEvents.splice(index, 1);
        }

        // but, do replay the remaining optimistic events as we're still expecting these to happen in the future since they haven't expired
        this.optimisticEvents.forEach(event => {
          try {
            this.optimisticState = produce(this.optimisticState, (_state: State) => {
              return this.actionDefinitions[event.event.type].handler(_state, event.dispatcher, event.event.payload as ZodAnyDef);
            });
          } catch (err) {
            // act as if this failed handler did not change the state
          }
        });
      }
    }

    // finally, as the optimistic state always changes, we should always broadcast to the optimistic subscriptions after each dispatch
    this.optimisticSubscriptions.forEach(subscription => {
      try {
        subscription(this.optimisticState);
      } catch (err) {
        // silently ignore errors in subscriptions
      }
    });

    return true;
  }

  /**
   * Subscribe with a callback to this eventSource. Any time the state changes, the callback is invoked with the new state.
   *
   * @param subscription The subscription callback that will be invoked with the new state any time that it changes.
   */
  onChange(subscription: Subscription<State>): void {
    this.subscriptions.push(subscription);
  }

  /**
   * Subscribe with a callback to the optimistic state of this eventSource. Any time the optimistic state changes, the callback is invoked with the new
   *  optimistic state.
   *
   * @param subscription The subscription callback that will be invoked with the new optimistic state any time that it changes.
   */
  onOptimisticChange(subscription: Subscription<State>): void {
    this.optimisticSubscriptions.push(subscription);
  }

  /**
   * Flush any optimistic state and reset the optimistic state to the source state.
   */
  flushOptimisticState(): void {
    // nothing to flush, end early
    if (this.optimisticEvents.length === 0) {
      return;
    }

    // flush all optimistic events
    this.optimisticEvents = [];
    this.optimisticState = this.sourceState;

    // broadcast to the optimistic subscriptions
    this.optimisticSubscriptions.forEach(subscription => subscription(this.optimisticState));
  }

  /**
   * Flush any expired optimistic state.
   */
  flushExpiredOptimisticState(): void {
    // first, we can prune all optimistic updates that are too old and are thus no longer relevant
    const beforeCount = this.optimisticEvents.length;
    const now = Date.now();
    this.optimisticEvents = this.optimisticEvents.filter(event => now < event.timestamp);

    // if nothing was pruned, end early
    if (this.optimisticEvents.length === beforeCount) {
      return;
    }

    // reset the optimistic state
    this.optimisticState = this.sourceState;

    // replay the remaining optimistic events as we're still expecting these to happen in the future since they haven't expired
    this.optimisticEvents.forEach(event => {
      this.optimisticState = produce(this.optimisticState, (_state: State) => {
        return this.actionDefinitions[event.event.type].handler(_state, event.dispatcher, event.event.payload as ZodAnyDef);
      });
    });

    // broadcast to the optimistic subscriptions
    this.optimisticSubscriptions.forEach(subscription => subscription(this.optimisticState));
  }
}
