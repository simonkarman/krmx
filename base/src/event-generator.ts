/**
 * An `EventListener` transform an argument array to a function that returns void and accepts the arguments in the array as its parameters.
 */
export type EventListener<T extends Array<unknown>, R = void> = (...args: T) => R;

/**
 * A function that can be called to stop listening to an event.
 */
export type Unsubscribe = () => void;

/**
 * An `AllEventListener` is a function that is called whenever any event is emitted. It is called with the event name and the arguments of the event.
 */
export type AllEventListener<T, R = void> = (eventName: T, ...args: unknown[]) => R;

/**
 * An `EventEmitter` can be used to listen to structured events based on a provided `EventMap`. The event map describes the possible events. Each
 *  event is described as a record where the key is a string representing the event name and the value is a typed array representing the arguments
 *  that that event is emitted with.
 *
 * An `EventEmitter` can be used to listen to events directly using `on` and in case of more complex behaviour it can be used to derive new
 *  `EventEmitters` using `pipe`.
 *
 * Example:
 * ```ts
 * type MyEventMap = { 'join': [name: string], 'leave': [name: string, reasonCode: number] }
 * const myEmitter: EventEmitter<MyEventMap> = ...;
 * myEmitter.on('leave', (name: string, reasonCode: number) => {
 *   // You implementation here that uses `name` and `reasonCode`.
 * });
 * ```
 */
export interface EventEmitter<EventMap extends Record<string, Array<unknown>>> {
  /**
   * The name of the event emitter. It will be used in the output logs when errors occur in the event listeners.
   */
  name: string;

  /**
   * Start listening to a specific event. The provided listener will be invoked each time the event is emitted.
   *
   * @param eventName The name of the event to listen to.
   * @param listener The callback that will be invoked when the event is emitted. It will be invoked with the event information in its arguments.
   */
  on<K extends keyof EventMap>(
    eventName: K,
    listener: EventListener<EventMap[K]>,
  ): Unsubscribe;

  /**
   * Start listening to a specific event only once. The provided listener will be invoked the first time the event is emitted.
   *
   * If a predicate is provided, the listener will only be invoked if the predicate returns true. The listener will be removed after the first time it
   *  is invoked. If the predicate returns false, the event subscription will be kept intact, until the predicate returns true.
   *
   * @param eventName The name of the event to listen to.
   * @param listener The callback that will be invoked when the event is emitted. It will be invoked with the event information in its arguments.
   * @param predicate An optional predicate that can be used to filter out events. If the predicate returns true, the listener will be invoked.
   */
  once<K extends keyof EventMap>(
    eventName: K,
    listener: EventListener<EventMap[K]>,
    predicate?: EventListener<EventMap[K], boolean>,
  ): Unsubscribe;

  /**
   * Start listening to all events. The provided listener will be invoked each time any event is emitted.
   *
   * @param listener The callback that will be invoked when any event is emitted. It will be invoked with the event name and the event information in
   *                  its arguments.
   */
  all(listener: AllEventListener<keyof EventMap>): Unsubscribe;

  /**
   * Wait for a specific event. The returned promise will resolve when the event is emitted. The promise will resolve with the event information.
   *
   * @param eventName The name of the event to wait for.
   * @param predicate Optionally provides a predicate that is invoked with every occurrence of the event. The promise will only resolve once the
   *                   predicate returns true. It will be invoked with the event information in its arguments. If the predicate throws an error, the
   *                   promise will be rejected with that error.
   */
  waitFor<K extends keyof EventMap>(
    eventName: K,
    predicate?: EventListener<EventMap[K], boolean>,
  ): Promise<EventMap[K]>;

  /**
   * Create new event emitter based on the existing event emitter with custom logic to define which events are passed through or transformed.
   *
   * @param configureTap In the configure tap callback function you can create custom logic to pass or transform events to
   *
   * Example:
   * ```ts
   * type MyEventMap = { 'hello': [name: string], 'one': [], 'unused': [value: number] }
   * const myEmitter: EventEmitter<MyEventMap> = ...;
   * type MyPipedEventMap = { 'hello': [name: string], 'two': [] }
   * const myPipedEmitter = myEmitter.pipe<MyPipedEventMap>(pipe => {
   *   pipe.pass('hello');
   *   pipe.on('one' () => {
   *     pipe.emit('two');
   *   });
   * });
   * myPipedEmitter.on('hello', (name: string) => { ... })
   * myPipedEmitter.on('two', () => { ... })
   *
   * TODO: Ensure that the pipe has a similar unsubscribe interface as on and once.
   */
  pipe<NextEventMap extends Record<string, Array<unknown>>>(configureTap: (tap: {
    /**
     * Ensures that events (with the provided event names) are passed through as-is to the next event emitter.
     * Note: Only event names that exist on both sides of the pipe and that have the same argument array signature are allowed to be passed.
     *
     * @param eventNames The names of the events you want to pass through as-is to the next event emitter. Only events that exist on both sides of the
     *  pipe and that have the same argument array signature are allowed to be passed.
     */
    pass<PrevK extends keyof EventMap = keyof EventMap,
      MutualEventKey extends PrevK extends keyof NextEventMap
        ? NextEventMap[PrevK] extends EventMap[PrevK]
          ? PrevK
          : never
        : never
        = PrevK extends keyof NextEventMap
        ? NextEventMap[PrevK] extends EventMap[PrevK]
          ? PrevK
          : never
        : never>(...eventNames: MutualEventKey[]): void,

    /**
     * Start listening to a specific event on the source event emitter.
     *
     * @param eventName The name of the event to listen to.
     * @param listener The callback that will be invoked when the event is emitted. It will be invoked with the event information in its arguments.
     */
    on<PrevK extends keyof EventMap>(eventName: PrevK, listener: EventListener<EventMap[PrevK]>): void,

    /**
     * Emits an event on the pipe to be received by the new EventEmitter.
     *
     * @param eventName The name of the event to emit.
     * @param args The arguments of the event to emit.
     */
    emit<NextK extends keyof NextEventMap>(eventName: NextK, ...args: NextEventMap[NextK]): unknown[],
  }) => void): EventEmitter<NextEventMap>;
}

/**
 * An EventGenerator is a type of EventEmitter that exposes the 'emit' method, which allows it to generate events.
 */
export class EventGenerator<EventMap extends Record<string, Array<unknown>>> implements EventEmitter<EventMap> {
  private allEventListeners: AllEventListener<keyof EventMap>[] = [];
  private eventListeners: {
    [K in keyof EventMap]?: EventListener<EventMap[K]>[];
  } = {};
  private isEmitting: (keyof EventMap)[] = [];
  public name = 'event-emitter';

  public on<K extends keyof EventMap>(
    eventName: K,
    listener: EventListener<EventMap[K]>,
  ): Unsubscribe {
    if (this.isEmitting.includes(eventName)) {
      throw new Error(`cannot subscribe to '${String(eventName)}' event in ${this.name} while that is also being emitted`);
    }
    // Important! Avoid mutating the original array as someone else might be iterating over it.
    const listeners = this.eventListeners[eventName] ?? [];
    this.eventListeners[eventName] = [...listeners, listener];
    return () => {
      /* istanbul ignore next */
      const listeners = this.eventListeners[eventName] ?? [];
      this.eventListeners[eventName] = listeners.filter(l => l !== listener);
    };
  }

  public once<K extends keyof EventMap>(
    eventName: K,
    listener: EventListener<EventMap[K]>,
    predicate?: EventListener<EventMap[K], boolean>,
  ): Unsubscribe {
    const unsubscribe = this.on(eventName, (...args) => {
      if (predicate === undefined || predicate(...args)) {
        unsubscribe();
        listener(...args);
      }
    });
    return unsubscribe;
  }

  public all(listener: AllEventListener<keyof EventMap>): Unsubscribe {
    if (this.isEmitting.length > 0) {
      throw new Error(`cannot subscribe to all events in ${this.name} while an event is being emitted`);
    }
    // Important! Avoid mutating the original array as someone else might be iterating over it.
    this.allEventListeners = [...this.allEventListeners, listener];
    return () => {
      this.allEventListeners = this.allEventListeners.filter(l => l !== listener);
    };
  }

  public waitFor<K extends keyof EventMap>(
    eventName: K,
    predicate?: EventListener<EventMap[K], boolean>,
  ): Promise<EventMap[K]> {
    return new Promise<EventMap[K]>((resolve, reject) => {
      const _predicate = predicate === undefined ? undefined : (...args: EventMap[K]): boolean => {
        try {
          return predicate(...args);
        } catch (e) {
          reject(e);
          throw e;
        }
      };
      this.once(eventName, (...args) => resolve(args), _predicate);
    });
  }

  public emit<K extends keyof EventMap>(eventName: K, ...args: EventMap[K]): unknown[] {
    // Start emitting
    this.isEmitting.push(eventName);
    const errors: unknown[] = [];
    const _try = (target: 'all' | 'on', callback: () => void) => {
      try {
        callback();
      } catch (e: unknown) {
        if (e instanceof Array) {
          errors.push(...e);
        } else {
          errors.push(e);
        }
        console.error(`[error] [${this.name}] [${target}:${String(eventName)}]`, e);
      }
    };

    // Emit event to each catch-all listener
    for (const listener of this.allEventListeners) {
      _try('all', () => listener(eventName, ...args));
    }

    // Emit event to each event specific listener
    const listeners = this.eventListeners[eventName] ?? [];
    for (const listener of [...listeners]) {
      _try('on', () => listener(...args));
    }

    // End emitting
    this.isEmitting.pop();
    return errors;
  }

  // TODO: see why pipe doesn't align with EventEmitter.pipe even though the signatures are equal
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  public pipe<NextEventMap extends Record<string, Array<unknown>>>(configurePipe: (pipe: {
    pass<PrevK extends keyof EventMap = keyof EventMap,
      MutualEventKey extends PrevK extends keyof NextEventMap
        ? NextEventMap[PrevK] extends EventMap[PrevK]
          ? PrevK
          : never
        : never
        = PrevK extends keyof NextEventMap
        ? NextEventMap[PrevK] extends EventMap[PrevK]
          ? PrevK
          : never
        : never>(...eventNames: MutualEventKey[]): void,
    on<PrevK extends keyof EventMap>(eventName: PrevK, listener: EventListener<EventMap[PrevK]>): void,
    emit<NextK extends keyof NextEventMap>(eventName: NextK, ...args: NextEventMap[NextK]): unknown[],
  }) => void): EventEmitter<NextEventMap> {
    const next = new EventGenerator<NextEventMap>();
    next.name = `tapped(${this.name})`;
    configurePipe({
      pass: (...eventNames) => {
        eventNames.forEach(eventName => {
          this.on(eventName, (...args) => {
            const nextArgs = args as unknown as NextEventMap[typeof eventName];
            next.emit(eventName, ...nextArgs);
          });
        });
      },
      on: this.on.bind(this),
      emit: next.emit.bind(next),
    });
    // TODO: see why pipe doesn't align with EventEmitter.pipe even though the signatures are equal
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    return next;
  }
}
