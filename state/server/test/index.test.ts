import { registerAtomModel } from '../src';
import { createServer } from '@krmx/server';

describe('Atom Model', () => {
  it('should allow to register an atom model to a server', () => {
    registerAtomModel(createServer(), {});
  });
});
