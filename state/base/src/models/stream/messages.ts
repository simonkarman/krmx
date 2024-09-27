import { Message } from '@krmx/base';

/**
 * An StreamAppendMessage represents appending an event to the event log.
 */
export interface StreamAppendMessage {
  type: 'stream/append',
  payload: { domain: string, dispatcher: string, event: Message },
}

/**
 * Verify that a message is an StreamAppendMessage.
 *
 * @param message The message to check.
 */
export const isStreamAppendMessage = (message: Message): message is StreamAppendMessage => {
  return message.type === 'es/event'
    && typeof message.payload === 'object'
    && message.payload !== null
    && 'domain' in message.payload
    && typeof message.payload.domain === 'string'
    && 'dispatcher' in message.payload
    && typeof message.payload.dispatcher === 'string'
    && 'event' in message.payload
    && typeof message.payload.event === 'object'
    && message.payload.event !== null
    && 'type' in message.payload.event
    && typeof message.payload.event.type === 'string';
};
