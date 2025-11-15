import { z, ZodAny, ZodAnyDef, ZodType, ZodUndefined } from 'zod';
import { Stream, StreamProps } from './stream';

export type EventDefinitions<State> = {
  [type: string]: {
    payloadSchema: ZodAny
    handler: <T extends State>(state: T, dispatcher: string, payload: ZodAnyDef) => T | void,
  }
};

/**
 * A stream model represents a typesafe state that can be derived from an event log. The projection also support optimistic events, which are events
 *  that are applied to the state before the server has confirmed the event was successfully appended to the state.
 *
 * Note: Keep in mind that the events should be safe to JSON decode and encode. Only use primitives, don't use classes, functions, or other complex
 *  types as part of your events.
 */
export class StreamModel<State> {
  private eventDefinitions: EventDefinitions<State> = {};
  public readonly initialState: State;

  /**
   * Create a new StreamModel by providing the initial state.
   *
   * @param initialState The initial state of the stream.
   */
  constructor(initialState: State) {
    this.initialState = initialState;
  }

  /**
   * Adds a new handler for when a specific type of event is dispatched.
   *
   * @param type The identifier of the event. This must be unique for this event source. For example: 'increment'
   * @param payloadSchema The Zod schema to use for the payload of the event. For example z.number().int().min(1).max(5)
   * @param handler The handler that will apply the payload to the state. This method receives the state, the dispatcher, and the payload. You can
   *  manipulate the state directly (made possible by Immer) or return a new state object.
   *
   * @returns Returns a constructor for creating type safe events.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  when<Type extends string, PayloadSchema extends ZodType<any, any, any>>(
    type: Type,
    payloadSchema: PayloadSchema,
    handler: (state: State, dispatcher: string, payload: z.infer<PayloadSchema>) => State | void,
  ):
    PayloadSchema extends ZodUndefined
      ? () => { type: Type, payload: undefined }
      : (payload: z.infer<PayloadSchema>) => { type: Type, payload: z.infer<PayloadSchema> } {
    if (this.eventDefinitions[type] !== undefined) {
      throw new Error(`event type ${type} is already in use`);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.eventDefinitions[type] = { payloadSchema, handler } as any;

    // @ts-expect-error as payload parameter could be undefined
    return (payload) => ({ type, payload });
  }

  /**
   * Spawns a new stream from this model. This stream can be used to dispatch events and subscribe to changes in the state.
   *
   * @param props The configuration for the stream.
   */
  spawn(props: StreamProps): Stream<State> {
    return new Stream<State>(this.initialState, this.eventDefinitions, props);
  }
}
