import { EventEmitter, EventGenerator } from '../src';

describe('Event Emitter', () => {
  describe('Basic Functionality', () => {
    type ExampleEvents = {
      hello: [name: string],
      file: [size: number, name: string];
    }
    class ExampleEmitter extends EventGenerator<ExampleEvents> {
      test(): [unknown[], unknown[]] {
        return [
          this.emit('hello', 'world'),
          this.emit('file', 11, 'example.json'),
        ];
      }
    }
    it('should callback listener on emit with the provided value', () => {
      let receivedFromHello: [string] | undefined;
      let receivedFromFile: [number, string] | undefined;
      const emitter = new ExampleEmitter();
      emitter.on('hello', (name) => {
        receivedFromHello = [name];
      });
      emitter.on('file', (size, name) => {
        receivedFromFile = [size, name];
      });
      expect(emitter.test()).toStrictEqual([[], []]);
      expect(receivedFromHello).toStrictEqual(['world']);
      expect(receivedFromFile).toStrictEqual([11, 'example.json']);
    });
    it('should callback each listener on emit', () => {
      const helloMock1 = jest.fn();
      const helloMock2 = jest.fn();
      const emitter = new ExampleEmitter();
      emitter.on('hello', helloMock1);
      emitter.on('hello', helloMock2);
      emitter.test();
      expect(helloMock1).toBeCalledTimes(1);
      expect(helloMock2).toBeCalledTimes(1);
    });
    it('should allow emitting an event without any listeners', () => {
      const emitter = new ExampleEmitter();
      emitter.test();
    });
    it('should callback a listener twice on emit if it is registered twice', () => {
      const helloMock = jest.fn();
      const emitter = new ExampleEmitter();
      emitter.on('hello', helloMock);
      emitter.on('hello', helloMock);
      emitter.test();
      expect(helloMock).toBeCalledTimes(2);
    });
    it('should catch a listener that throws and return the errors', () => {
      const helloMock = jest.fn();
      const emitter = new ExampleEmitter();
      emitter.on('hello', () => helloMock());
      emitter.on('hello', jest.fn(() => { helloMock(); throw Error('custom'); }));
      emitter.on('hello', () => helloMock());
      expect(emitter.test()).toStrictEqual([[Error('custom')], []]);
      expect(helloMock).toBeCalledTimes(3);
    });
    it('should return a flatted list of errors if the errors thrown are arrays', () => {
      const emitter = new ExampleEmitter();
      emitter.on('hello', () => {
        throw [Error('1'), Error('2')];
      });
      emitter.on('hello', () => {
        throw [Error('3'), Error('4')];
      });
      expect(emitter.test()).toStrictEqual([[Error('1'), Error('2'), Error('3'), Error('4')], []]);
    });
    it('should not allow subscriptions on the specific event(s) being emitted', () => {
      class RecursiveEmitter extends EventGenerator<ExampleEvents> {
        test() {
          const helloMock = jest.fn();
          const fileMock = jest.fn();
          this.on('hello', () => {
            expect(() => this.on('hello', helloMock)).toThrow('cannot subscribe to \'hello\' event in my-emitter while that is also being emitted');
            expect(() => this.on('file', fileMock)).not.toThrow();
            expect(() => this.emit('file', 2, 'a')).not.toThrow();
          });
          expect(this.emit('hello', 'simon')).toStrictEqual([]);
          expect(fileMock).toBeCalledTimes(1);
          expect(helloMock).toBeCalledTimes(0);
        }
      }
      const emitter = new RecursiveEmitter();
      emitter.name = 'my-emitter';
      emitter.test();
    });
    it('should not allow subscriptions on all event(s) being currently emitted', () => {
      class RecursiveEmitter extends EventGenerator<ExampleEvents> {
        test() {
          const mock = jest.fn();
          this.on('hello', (name: string) => {
            expect(() => this.on('hello', mock)).toThrow('cannot subscribe to \'hello\' event in event-emitter while that is also being emitted');
            if (name === 'from-file') {
              expect(() => this.on('file', mock)).toThrow('cannot subscribe to \'file\' event in event-emitter while that is also being emitted');
            } else if (name === 'from-root') {
              this.emit('hello', 'from-hello');
            } else {
              expect(() => this.on('file', mock)).not.toThrow();
            }
            expect(() => this.on('hello', mock)).toThrow('cannot subscribe to \'hello\' event in event-emitter while that is also being emitted');
          });
          this.on('file', () => {
            expect(this.emit('hello', 'from-file')).toStrictEqual([]);
          });
          expect(this.emit('file', 3, 'kg')).toStrictEqual([]);
          expect(this.emit('hello', 'from-root')).toStrictEqual([]);
          expect(mock).not.toBeCalled();
        }
      }
      new RecursiveEmitter().test();
    });
  });
  describe('Unsubscribe Functionality', () => {
    type HelloEvent = { hello: [name: string] };
    it('should allow unsubscribing from an event', () => {
      const emitter = new EventGenerator<HelloEvent>();
      const mock = jest.fn();
      const unsubscribe = emitter.on('hello', mock);
      emitter.emit('hello', 'world');
      expect(mock).toHaveBeenCalledTimes(1);
      unsubscribe();
      emitter.emit('hello', 'world');
      expect(mock).toHaveBeenCalledTimes(1);
    });
    it('should allow listing to an event only once', () => {
      const emitter = new EventGenerator<HelloEvent>();
      const mock = jest.fn();
      emitter.once('hello', mock, (name: string) => name === 'world');
      emitter.emit('hello', 'not-world');
      expect(mock).not.toHaveBeenCalled();
      emitter.emit('hello', 'world');
      emitter.emit('hello', 'world');
      expect(mock).toHaveBeenCalledTimes(1);
    });
    it('should allow unsubscribing from a once-event before it was sent out', () => {
      const emitter = new EventGenerator<HelloEvent>();
      const mock = jest.fn();
      const unsubscribe = emitter.once('hello', mock);
      unsubscribe();
      emitter.emit('hello', 'world');
      expect(mock).not.toHaveBeenCalled();
    });
    it('should send messages to other listeners even if one listener unsubscribes', () => {
      const emitter = new EventGenerator<HelloEvent>();
      const mock1 = jest.fn();
      const mock2 = jest.fn();
      emitter.once('hello', mock1);
      emitter.on('hello', mock2);
      emitter.emit('hello', 'world');
      expect(mock1).toHaveBeenCalledTimes(1);
      expect(mock2).toHaveBeenCalledTimes(1);
      emitter.emit('hello', 'world');
      expect(mock1).toHaveBeenCalledTimes(1);
      expect(mock2).toHaveBeenCalledTimes(2);
    });
  });
  describe('Pipe Functionality', () => {
    type SourceEvents = { 'hello': [name: string], age: [number], something: [], extraSource: [] };
    type PipedEvents = { 'age': [number], 'hello': [name: string, counter: number], something: [], extraPipe: [] };
    type PipedAgainEvents = { 'age': [number] };
    const getTestSetup = () => {
      const source: EventGenerator<SourceEvents> = new EventGenerator<SourceEvents>();
      const piped = source.pipe<PipedEvents>(pipe => {
        let helloCounter = 0;
        pipe.pass('age', 'something');
        pipe.on('hello', (name) => {
          helloCounter += 1;
          pipe.emit('hello', name, helloCounter);
        });
      });
      const pipedAgain = piped.pipe<PipedAgainEvents>(pipe => {
        let ageCounter = 0;
        pipe.pass('age');
        pipe.on('extraPipe', () => {
          ageCounter += 1;
          pipe.emit('age', ageCounter);
        });
      });
      return { source, piped, pipedAgain };
    };
    it('should allow passing a source event as-is through the pipe', () => {
      const { source, piped } = getTestSetup();
      const mock = jest.fn();
      piped.on('something', mock);
      source.emit('something');
      expect(mock).toHaveBeenCalled();
    });
    it('should allow passing a source event as-is through consecutive pipes', () => {
      const { source, pipedAgain } = getTestSetup();
      const mock = jest.fn();
      pipedAgain.on('age', mock);
      source.emit('age', 3);
      expect(mock).toHaveBeenCalled();
      expect(mock).toHaveBeenCalledWith(3);
    });
    it('should allow that a source event is not processed by a pipe', () => {
      const { source } = getTestSetup();
      source.emit('extraSource');
    });
    it('should allow transforming an source event using on and emit in a pipe', () => {
      const { source, piped } = getTestSetup();
      const mock = jest.fn();
      piped.on('hello', mock);
      source.emit('hello', 'simon');
      source.emit('hello', 'simon');
      expect(mock).toHaveBeenCalledTimes(2);
      expect(mock).toHaveBeenCalledWith('simon', 1);
      expect(mock).toHaveBeenCalledWith('simon', 2);
    });
  });
});
