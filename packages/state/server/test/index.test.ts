import { registerAtoms, registerProjection, registerStream } from '../src';
import { createServer } from '@krmx/server';
import { ProjectionModel, StreamModel } from '@krmx/state';

describe('Atom', () => {
  it('should allow to register atoms to a server', () => {
    registerAtoms(createServer(), {});
  });
});

describe('Stream', () => {
  it('should allow to register a stream model to a server', () => {
    const model = new StreamModel({ counter: 0 });
    registerStream(createServer(), 'my-domain', model, { optimisticSeconds: 10 });
  });
});

describe('Projection', () => {
  it('should allow to register a projection model to a server', () => {
    const model = new ProjectionModel({ counter: 0 }, s => s.counter);
    registerProjection(createServer(), 'my-domain', model);
  });
});
