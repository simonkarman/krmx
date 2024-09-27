import { ProjectionModel, Random } from '../../src';
import { z } from 'zod';
import { patch } from 'jsondiffpatch';

describe('Projection Model', () => {
  it('should work with the documentation example', () => {
    const model = new ProjectionModel(
      // the initial state of the system
      { items: [{ owner: 'simon', value: 3 }, { owner: 'lisa', value: 4 }] },
      // the projection mapper function
      (state, username) => ({
        yourItems: state.items.filter(item => item.owner === username),
        totalValue: state.items.reduce((sum, item) => sum + item.value, 0),
      }),
    );
    const inc = model.when(
      'increment',
      // payload schema
      z.number().int().min(1).max(5),
      // handler (ran server side only)
      (state, dispatcher, payload) => {
        state.items.forEach(item => {
          if (item.owner === dispatcher) {
            item.value += payload;
          }
        });
      },
      // optimistic handler (ran client side only)
      (view, _, payload) => {
        view.yourItems.forEach(item => {
          item.value += payload;
          view.totalValue += payload;
        });
      });

    // Spawn a server
    const server = model.spawnServer();

    // Spawn a client
    const client = model.spawnClient();
    client.set(server.projection('simon'));
    server.subscribe((getDeltaFor, optimisticId) => {
      const delta = getDeltaFor('simon');
      if (delta === false) {
        optimisticId && client.releaseOptimistic(optimisticId);
        return;
      }
      client.apply(delta, optimisticId);
    });

    // Dispatch an action
    const action = inc(2);
    const clientResult = client.optimistic('simon', action);
    if (clientResult.success) {
      const serverResult = server.dispatch('simon', action, clientResult.optimisticId);
      if (!serverResult.success && clientResult.optimisticId) {
        client.releaseOptimistic(clientResult.optimisticId);
      }
    }

    // Expect
    expect(server.projection('simon')).toStrictEqual(client.projection());
  });
  it('should work with a complex example including optimistic state', () => {
    // Define patched state
    type LotState = { r: Random, lastLotId: number, lots: { id: string, owner: string, value: number }[], cash: { [username: string]: number } };
    type LotProjection = { lots: { owner: 'you' | 'someone-else', value: number | '?' }[], cash: { [username: string]: number } };
    const lotState = new ProjectionModel<LotState, LotProjection>(
      { r: new Random(Date.now().toString()), lastLotId: 34000, lots: [], cash: {} },
      (state: LotState, username) => ({
        lots: state.lots.map(lot => ({
          owner: lot.owner === username ? 'you' : 'someone-else',
          value: lot.value,
        })),
        cash: state.cash,
      }),
    );
    const drawLot = lotState.when('draw', z.undefined(), (state: LotState, dispatcher: string) => {
      state.lastLotId += 1;
      state.lots.push({ id: `l-${state.lastLotId}`, owner: dispatcher, value: state.r.rangeInt(1, 9) });
    }, (view: LotProjection) => {
      view.lots.push({ owner: 'you', value: '?' });
    });
    const cashOut = lotState.when('cash-out', z.string(), (state: LotState, dispatcher: string, lotId: string) => {
      const lotIndex = state.lots.findIndex(lot => lot.id === lotId);
      if (lotIndex === -1) {
        throw new Error('a lot with that id does not exist');
      }
      const lot = state.lots[lotIndex];
      const cash = state.lots.filter(lot => lot.owner === dispatcher).reduce((sum, lot) => sum + lot.value, 0) * lot.value;
      state.lots = state.lots.filter(lot => lot.owner !== dispatcher || lot.id === lotId);
      state.cash[dispatcher] = (state.cash[dispatcher] || 0) + cash;
    });
    const noop = lotState.when('noop', z.undefined(), () => { /* do nothing */ });

    // Start example server
    const server = lotState.spawnServer();
    server.dispatch('simon', drawLot());
    server.dispatch('lisa', drawLot());

    // After some initial actions, start an example client for lisa
    const client = lotState.spawnClient();
    server.subscribe((getDeltaFor, optimisticId) => {
      const delta = getDeltaFor('lisa');
      if (delta === false) {
        optimisticId && client.releaseOptimistic(optimisticId);
        return;
      }
      try {
        client.apply(delta, optimisticId); // this happens through Krmx
      } catch (err) {
        console.error('error applying delta', err);
      }
    });
    let latestProjection: LotProjection = undefined as unknown as LotProjection;
    client.subscribe((view) => {
      latestProjection = view; // this would update external store in react
    });
    client.set(server.projection('lisa')); // this happens through Krmx

    // Send some more messages and validate the views
    server.dispatch('simon', drawLot());
    server.dispatch('simon', noop());
    const clientEvent = drawLot();
    const result = client.optimistic('lisa', clientEvent);
    expect(latestProjection.lots.filter(l => l.owner === 'you' && l.value === '?').length).toBe(1);
    server.dispatch('lisa', drawLot());
    server.dispatch('lisa', clientEvent, result.success ? result.optimisticId : undefined); // this happens through Krmx
    server.dispatch('lisa', noop());
    server.dispatch('simon', drawLot());
    server.dispatch('lisa', cashOut('l-34003'));
    expect(latestProjection).toStrictEqual(server.projection('lisa'));
    expect(latestProjection).toStrictEqual(client.projection());
  });
  it('should not allow applying or optimistic when set is not called', () => {
    const state = new ProjectionModel({ value: 0 }, (state) => state);
    const inc = state.when('inc', z.undefined(), (state) => { state.value += 1; });
    const client = state.spawnClient();
    expect(() => client.apply({})).toThrow();
    expect(() => client.optimistic('simon', inc())).toThrow();
    expect(client.projection()).toBeUndefined();
  });
  it('should mark optimistic updates as executed even if the view is not updated', () => {
    const state = new ProjectionModel(
      { value: 0, view: 1 },
      (state) => state.view,
    );
    // inc only changes the value, which is not part of the view, while it does change the view optimistically
    // this is to test that the optimistic update is marked as executed even if the view for that client does not show a delta
    const inc = state.when('inc', z.undefined(), (state) => { state.value += 1; }, (view) => view + 1);

    const server = state.spawnServer();
    const client = state.spawnClient();

    client.set(server.projection('simon')); // send from server to client through Krmx
    server.subscribe((getDeltaFor, optimisticId) => {
      const delta = getDeltaFor('simon');
      if (delta === false) {
        optimisticId && client.releaseOptimistic(optimisticId); // send from server to client through Krmx
        return;
      }
      client.apply(delta, optimisticId); // send from server to client through Krmx
    });
    const action = inc();
    const result = client.optimistic('simon', action);
    if (result.success) {
      server.dispatch('client', action, result.optimisticId); // action and optimistic id send from client to server through Krmx
    }

    expect(server.projection('simon')).toStrictEqual(client.projection());
  });
  it('validate patching with JSON serialized delta works', () => {
    const deltaMessage = {
      'type': 'projection/delta',
      'payload': {
        'domain': 'card-game',
        'delta': {
          'order': { '0': ['lisa'], '1': ['simon'], '_t': 'a' },
          'deckSize': [0, 41],
          'pile': {
            '0': [{ 'id': 'cRcPmYSDTkTBA', 'suit': '♣', 'rank': '9' }],
            '_t': 'a',
          },
          'hands': {
            '0': [{ 'username': 'simon', 'handSize': 5 }],
            '1': [{ 'username': 'lisa', 'handSize': 5 }],
            '_t': 'a',
          },
          'hand': {
            '0': [{ 'id': 'cqOYBFyi5DRq', 'suit': '♠', 'rank': '6' }],
            '1': [{ 'id': 'ckMrU0D0Ah1e', 'suit': '♦', 'rank': '3' }],
            '2': [{ 'id': 'cf9wvhBzfmq2H', 'suit': '♣', 'rank': '6' }],
            '3': [{ 'id': 'c4IBNswUKPaXy', 'suit': '♥', 'rank': 'Q' }],
            '4': [{ 'id': 'ctBkk2cbdTzD5', 'suit': '♠', 'rank': 'J' }],
            '_t': 'a',
          },
        },
      },
    };
    const current = {
      'finishers': [],
      'order': [],
      'turn': 0,
      'deckSize': 0,
      'pile': [],
      'hands': [],
      'hand': [],
    };
    const setMessage = {
      'type': 'projection/set',
      'payload': {
        'domain': 'card-game',
        'view': {
          'finishers': [],
          'order': [],
          'turn': 0,
          'deckSize': 0,
          'pile': [],
          'hands': [],
          'hand': [],
        },
      },
    };
    expect(setMessage.payload.view).toStrictEqual(current);
    expect(patch(current, deltaMessage.payload.delta)).toStrictEqual({
      finishers: [],
      order: [ 'lisa', 'simon' ],
      turn: 0,
      deckSize: 41,
      pile: [ { id: 'cRcPmYSDTkTBA', suit: '♣', rank: '9' } ],
      hands: [
        { username: 'simon', handSize: 5 },
        { username: 'lisa', handSize: 5 },
      ],
      hand: [
        { id: 'cqOYBFyi5DRq', suit: '♠', rank: '6' },
        { id: 'ckMrU0D0Ah1e', suit: '♦', rank: '3' },
        { id: 'cf9wvhBzfmq2H', suit: '♣', rank: '6' },
        { id: 'c4IBNswUKPaXy', suit: '♥', rank: 'Q' },
        { id: 'ctBkk2cbdTzD5', suit: '♠', rank: 'J' },
      ],
    });
  });
  // test optimistic for event with no optimistic handler
  // make errors thrown in server handler available to the user
  // make errors thrown in optimistic handler available to the user
  // validate if there are any other places where errors are completely ignored and inaccessible to the user
  // allow a server handler to already commit any made changes during the handler, that if the handler throws an error, the those prior changes are
  //   not rolled back
  // TODO: think about how to handle informing the clients about the mistakes they made (errors thrown by the server handlers)
  // TODO: add support for unsubscribe and use this in client and server implentations
});
