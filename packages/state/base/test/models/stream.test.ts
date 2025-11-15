import { z, ZodError } from 'zod';
import { StreamModel } from '../../src';

const createExampleStreamModel = () => {
  const model = new StreamModel({ data: 0 });
  const inc = model.when('inc', z.number(), (state, dispatcher, payload) => {
    state.data += dispatcher.length;
    state.data *= payload;
  });
  const stream = model.spawn({ optimisticSeconds: 10 });
  const mockSubscription = jest.fn();
  stream.onChange(mockSubscription);
  const mockOptimisticSubscription = jest.fn();
  stream.onOptimisticChange(mockOptimisticSubscription);
  return { model, stream, mockSubscription, mockOptimisticSubscription, inc };
};

describe('Stream Model', () => {
  it('should support basic functionality of when, onChange, and dispatch', () => {
    const { stream, mockSubscription, inc } = createExampleStreamModel();
    expect(stream.dispatch('root', inc(2))).toBe(true);
    expect(mockSubscription).toHaveBeenCalledWith({ data: 8 });
    expect(stream.dispatch('another', inc(3))).toBe(true);
    expect(mockSubscription).toHaveBeenCalledWith({ data: 45 });
  });
  it('should work with the example from the documentation', () => {
    const model = new StreamModel({ counter: 0 });
    const increment = model.when('increment', z.number(), (state, dispatcher, payload) => {
      if (dispatcher === 'admin') {
        state.counter += payload;
      }
    });

    const stream = model.spawn({ optimisticSeconds: 10 });
    const mock = jest.fn();
    stream.onChange(mock);
    stream.dispatch('admin', increment(3));
    expect(mock).toHaveBeenCalledWith({ counter: 3 });
  });
  it('should not allow to rebind the same event type twice', () => {
    const { model } = createExampleStreamModel();
    expect(() => model.when('inc', z.string(), (state) => {
      state.data = 0;
    })).toThrow('event type inc is already in use');
  });
  it('should allow using a z.undefined() schema as the payload schema, and constructing an instance of it without providing an argument', () => {
    const model = new StreamModel({ data: 0 });
    const u = model.when('undefined', z.undefined(), (state, dispatcher) => {
      state.data += dispatcher.length;
    });
    expect(u()).toEqual({ type: 'undefined' });
    expect(u()).toEqual({ type: 'undefined', payload: undefined });
  });
  it('should allow using a z.object() schema as the payload schema', () => {
    const model = new StreamModel({ data: 0 });
    const obj = model.when('object', z.object({
      hello: z.string(),
      world: z.object({ name: z.string(), age: z.number() }),
    }), (state, _, payload) => {
      state.data = payload.world.age;
    });
    const exampleObject = () => ({ hello: 'hey', world: { name: 'simon', age: 30 } });
    expect(obj(exampleObject())).toEqual({
      type: 'object',
      payload: exampleObject(),
    });
    const stream = model.spawn({ optimisticSeconds: 10 });
    expect(stream.dispatch('root', { type: 'object', payload: {} })).toBeInstanceOf(ZodError);
    expect(stream.dispatch('root', { type: 'object', payload: exampleObject() })).toBe(true);
  });
  it('should return false on dispatching an event with an unknown type', () => {
    const { stream, mockSubscription } = createExampleStreamModel();
    expect(stream.dispatch('root', { type: 'this-does-not-exist', payload: 'irrelevant' })).toBe(false);
    expect(mockSubscription).not.toHaveBeenCalled();
  });
  it('should return the zod error when dispatching an event with a schema mismatch', () => {
    const { stream, mockSubscription } = createExampleStreamModel();
    expect(stream.dispatch('root', { type: 'inc', payload: 'not-a-number' })).toBeInstanceOf(ZodError);
    expect(mockSubscription).not.toHaveBeenCalled();
  });
  it('should allow a handler to return a new state object instead of manipulating the existing state', () => {
    const model = new StreamModel({ reset: false });
    const reset = model.when('reset', z.undefined(), () => ({ reset: true }));
    const stream = model.spawn({ optimisticSeconds: 10 });
    const mock = jest.fn();
    stream.onChange(mock);
    stream.dispatch('root', reset());
    expect(mock).toHaveBeenCalledWith({ reset: true });
  });
  it('should gracefully handle error thrown in any handler as if the state was not changed', () => {
    const model = new StreamModel({ data: 0 });
    const increment = model.when('increment', z.number(), (state, _, payload) => {
      state.data += payload;
    });
    const errorIfFive = model.when('errorIfFive', z.undefined(), (state) => {
      state.data += 1; // test that even changing the state before an error does not result in a change
      if (state.data === 6) {
        throw new Error('data was 5!');
      }
    });
    const stream = model.spawn({ optimisticSeconds: 10 });
    const mock = jest.fn();
    const optimisticMock = jest.fn();
    stream.onChange(mock);
    stream.onOptimisticChange(optimisticMock);
    stream.dispatch('root', increment(2));
    stream.dispatch('root', errorIfFive(), true); // test an initially succeeded optimistic event can fail later
    stream.dispatch('root', increment(3));
    stream.dispatch('root', errorIfFive()); // test a non-optimistic event can fail
    stream.dispatch('root', errorIfFive(), true); // test an optimistic event can fail, and be resolved later
    stream.dispatch('root', increment(2));
    stream.dispatch('root', errorIfFive());
    expect(mock.mock.calls).toStrictEqual([
      [ { data: 2 } ],
      [ { data: 5 } ],
      [ { data: 5 } ],
      [ { data: 7 } ],
      [ { data: 8 } ],
    ]);
    expect(optimisticMock.mock.calls).toStrictEqual([
      [ { data: 2 } ],
      [ { data: 3 } ],
      [ { data: 5 } ],
      [ { data: 5 } ],
      [ { data: 5 } ],
      [ { data: 8 } ],
      [ { data: 8 } ],
    ]);
  });
  it('should allow an event to be dispatched optimistically, only triggering an optimistic update', () => {
    const { stream, mockSubscription, mockOptimisticSubscription, inc } = createExampleStreamModel();
    stream.dispatch('root', inc(3), true);
    expect(mockSubscription).not.toHaveBeenCalled();
    expect(mockOptimisticSubscription).toHaveBeenCalledWith({ data: 12 });
  });
  it('should allow multiple optimistically dispatched events to stack', () => {
    const { stream, mockOptimisticSubscription, inc } = createExampleStreamModel();
    stream.dispatch('root', inc(3), true);
    stream.dispatch('person', inc(5), true);
    expect(mockOptimisticSubscription).toHaveBeenCalledTimes(2);
    expect(mockOptimisticSubscription).toHaveBeenNthCalledWith(2, { data: 90 });
  });
  it('should reapply optimistically dispatched events after one of the events has been verified', () => {
    const { stream, mockSubscription, mockOptimisticSubscription, inc } = createExampleStreamModel();
    stream.dispatch('root', inc(3), true);
    stream.dispatch('person', inc(5), true);
    stream.dispatch('person', inc(5), false);
    expect(mockSubscription).toHaveBeenCalledTimes(1);
    expect(mockSubscription).toHaveBeenCalledWith({ data: 30 });
    expect(mockOptimisticSubscription).toHaveBeenCalledTimes(3);
    expect(mockOptimisticSubscription).toHaveBeenNthCalledWith(3, { data: 102 });
  });
  it('should prune all expired optimistically dispatched events', () => {
    const { stream, mockOptimisticSubscription, inc } = createExampleStreamModel();
    stream.dispatch('root', inc(4), true);
    stream.props.optimisticSeconds = -1; // immediate expiry for next optimistic events
    stream.dispatch('person-a', inc(6), true);
    stream.dispatch('person-b', inc(7), true);
    stream.dispatch('person', inc(5));
    expect(mockOptimisticSubscription).toHaveBeenCalledTimes(4);
    expect(mockOptimisticSubscription).toHaveBeenNthCalledWith(4, { data: 136 });
  });
  it('should allow to flush all optimistic state', () => {
    const { stream, mockOptimisticSubscription, inc } = createExampleStreamModel();
    stream.dispatch('root', inc(4), true);
    stream.flushOptimisticState();
    expect(mockOptimisticSubscription).toHaveBeenCalledTimes(2);
    expect(mockOptimisticSubscription).toHaveBeenNthCalledWith(2, { data: 0 });
  });
  it('should allow to manually flush all expired optimistic state', () => {
    const { stream, mockOptimisticSubscription, inc } = createExampleStreamModel();
    stream.props.optimisticSeconds = -1; // immediate expiry for next optimistic events
    stream.dispatch('admin', inc(2), true);
    stream.props.optimisticSeconds = 10;
    stream.dispatch('root', inc(6), true);
    stream.props.optimisticSeconds = -1; // immediate expiry for next optimistic events
    stream.dispatch('admin', inc(3), true);
    stream.flushExpiredOptimisticState();
    expect(mockOptimisticSubscription).toHaveBeenCalledTimes(4);
    expect(mockOptimisticSubscription).toHaveBeenNthCalledWith(4, { data: 24 });
  });
  it('should verify only one event if multiple exact copies of the same event are optimistic', () => {
    const { stream, mockOptimisticSubscription, inc } = createExampleStreamModel();
    stream.dispatch('person-a', inc(4), true);
    stream.dispatch('person-a', inc(4), true);
    stream.dispatch('person-a', inc(4));
    expect(mockOptimisticSubscription).toHaveBeenCalledTimes(3);
    expect(mockOptimisticSubscription).toHaveBeenNthCalledWith(3, { data: 160 });
  });
  it('should not broadcast to optimistic subscriptions when nothing was flushed', () => {
    const { stream, mockOptimisticSubscription } = createExampleStreamModel();
    stream.flushExpiredOptimisticState();
    stream.flushOptimisticState();
    expect(mockOptimisticSubscription).not.toHaveBeenCalled();
  });
  it('should not change initial state during usage', () => {
    const { model, stream, inc } = createExampleStreamModel();
    stream.dispatch('root', inc(3));
    stream.dispatch('admin', inc(4), true);
    expect(model.initialState).toStrictEqual({ data: 0 });
    expect(stream.initialState).toStrictEqual({ data: 0 });
  });
  it('should be able to reset to the initial state', () => {
    const { stream, inc, mockSubscription, mockOptimisticSubscription } = createExampleStreamModel();
    stream.dispatch('root', inc(3));
    stream.dispatch('admin', inc(4), true);
    stream.reset();
    expect(mockSubscription).toHaveBeenNthCalledWith(2, { data: 0 });
    expect(mockOptimisticSubscription).toHaveBeenNthCalledWith(3, { data: 0 });
  });
});
