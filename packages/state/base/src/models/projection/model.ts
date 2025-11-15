import { z, ZodAny, ZodAnyDef, ZodType, ZodUndefined } from 'zod';
import { ProjectionServer } from './server';
import { ProjectionClient } from './client';

export type ActionDefinitions<State, Projection> = {
  [type: string]: {
    payloadSchema: ZodAny
    handler: <T extends State>(state: T, dispatcher: string, payload: ZodAnyDef) => T | void,
    optimisticHandler: (<T extends Projection>(projection: T, dispatcher: string, payload: ZodAnyDef) => T | void) | undefined,
  }
};

/**
 * A projection model represents a typesafe state and individual (possibly unique) projections on top of that state, including the corresponding
 *  actions that can be taken to alter the original state and trigger updates on the projections. The projections are updated through patches, which
 *  are deltas between the previous projection and the new projection.
 *
 * The projection also support optimistic updates, which are updates that are applied to the projection before the server has confirmed the update to
 *  the state.
 *
 * Note: Keep in mind that the projection should be safe to JSON decode and encode. Only use primitives, don't use classes, functions, or other
 * complex types as part of your projection.
 */
export class ProjectionModel<State, Projection> {
  private actionDefinitions: ActionDefinitions<State, Projection> = {};
  private immutable = false;

  /**
   * Creates a new projection model.
   *
   * @param initialState The initial server-side state.
   * @param projectionMapper A function that maps the state to a projection for a specific user. This function will be called for each client whenever the
   *  state changes. The delta from the previous projection to the new projection will be sent to the client in the form of a delta.
   */
  constructor(
    public readonly initialState: State,
    private readonly projectionMapper: (state: State, username: string) => Projection,
  ) {}

  /**
   * Adds a new handler for when a specific type of action is dispatched.
   *
   * @param type The identifier of the action. This must be unique for this model. For example: 'increment'
   * @param payloadSchema The Zod schema to use for the payload of the action. For example z.number().int().min(1).max(5)
   * @param handler The handler that applies the payload to the state. This method receives the state, the dispatcher, and the payload.
   * @param optimisticHandler An optional handler that immediately applies the payload to the projection. This method receives the projection, the
   *  dispatcher, and the payload.
   *
   * Note: In the handlers you can safely manipulate the state and projection objects directly. Alternatively, you can return a new object from these
   *  handlers.
   *
   * @returns Returns a constructor for creating type safe actions for this type of action.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  when<Type extends string, PayloadSchema extends ZodType<any, any, any>>(
    type: Type,
    payloadSchema: PayloadSchema,
    handler: (state: State, dispatcher: string, payload: z.infer<PayloadSchema>) => State | void,
    optimisticHandler?: (projection: Projection, dispatcher: string, payload: z.infer<PayloadSchema>) => Projection | void,
  ):
    PayloadSchema extends ZodUndefined
      ? () => { type: Type, payload: undefined }
      : (payload: z.infer<PayloadSchema>) => { type: Type, payload: z.infer<PayloadSchema> } {
    // check if an action type is added after the server or client is spawned
    if (this.immutable) {
      throw new Error('cannot add new action type after spawning a server or client');
    }

    // check if the type is already in use
    if (this.actionDefinitions[type] !== undefined) {
      throw new Error(`action type ${type} is already in use`);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.actionDefinitions[type] = { payloadSchema, handler, optimisticHandler } as any;

    // @ts-expect-error as payload parameter could be undefined
    return (payload) => ({ type, payload });
  }

  /**
   * Spawns a server.
   *
   * Once you spawn a server or client, no further actions can be added to the model.
   */
  spawnServer(): ProjectionServer<State, Projection> {
    this.immutable = true;
    return new ProjectionServer<State, Projection>(this.initialState, this.projectionMapper, this.actionDefinitions);
  }

  /**
   * Spawns a client.
   *
   * Once you spawn a server or client, no further actions can be added to the model.
   */
  spawnClient(): ProjectionClient<Projection> {
    this.immutable = true;
    return new ProjectionClient<Projection>(this.actionDefinitions);
  }
}
