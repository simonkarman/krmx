import { Message } from '@krmx/base';

/**
 * Representation of a sync-able value. It can be a string, number, or boolean.
 */
export type Value = string | number | boolean;

/**
 * Convert a string value to a value.
 *  'abc' -> string
 *  '123' -> number
 *  'true' -> true
 *
 * @param value The value to convert.
 */
export const toValue = (value: string): Value => {
  if (value === 'true') {
    return true;
  }
  if (value === 'false') {
    return false;
  }
  const number = Number(value);
  return isNaN(number) ? value : number;
};

/**
 * A message to set a synced value.
 */
export type ValueSetMessage = { type: 'value/set', payload: { key: string, value: Value } };

/**
 * Check if a message is a ValueSetMessage.
 *
 * @param message The message to check.
 */
export const isValueSetMessage = (message: Message): message is ValueSetMessage => {
  return message.type === 'sv/set'
    && typeof message.payload === 'object'
    && message.payload !== null
    && 'key' in message.payload
    && typeof message.payload.key === 'string'
    && 'value' in message.payload
    && (typeof message.payload.value === 'string' || typeof message.payload.value === 'number' || typeof message.payload.value === 'boolean');
};
