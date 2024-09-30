import { Message } from '@krmx/base';

/**
 * Representation of an Atom. It can be a string, number, or boolean.
 */
export type Atom = string | number | boolean;

/**
 * Parse a string to an atom (boolean, number or string).
 *  'abc' -> string
 *  '123' -> number
 *  'true' -> true
 *
 * @param input The input string to parse.
 */
export const parseAtom = (input: string): Atom => {
  if (input === 'true') {
    return true;
  }
  if (input === 'false') {
    return false;
  }
  const number = Number(input);
  return isNaN(number) ? input : number;
};

/**
 * A message to set an Atom .
 */
export type AtomSetMessage = { type: 'atom/set', payload: { key: string, atom: Atom } };

/**
 * Check if a message is a AtomSetMessage.
 *
 * @param message The message to check.
 */
export const isAtomSetMessage = (message: Message): message is AtomSetMessage => {
  return message.type === 'atom/set'
    && typeof message.payload === 'object'
    && message.payload !== null
    && 'key' in message.payload
    && typeof message.payload.key === 'string'
    && 'atom' in message.payload
    && (typeof message.payload.atom === 'string' || typeof message.payload.atom === 'number' || typeof message.payload.atom === 'boolean');
};
