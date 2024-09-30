import { Delta } from 'jsondiffpatch';
import { Message } from '@krmx/base';

/**
 * A ProjectionDeltaMessage represents a delta on the projection of a client.
 */
export interface ProjectionDeltaMessage {
  type: 'projection/delta',
  payload: { domain: string, delta: Delta, optimisticId?: string | undefined },
}

/**
 * Verify that a message is a ProjectionDeltaMessage.
 *
 * @param message The message to check.
 */
export const isProjectionDeltaMessage = (message: Message): message is ProjectionDeltaMessage => {
  return message.type === 'projection/delta'
    && typeof message.payload === 'object'
    && message.payload !== null
    && 'domain' in message.payload
    && typeof message.payload.domain === 'string'
    && 'delta' in message.payload
    && typeof message.payload.delta === 'object'
    && message.payload.delta !== null
    && (
      ('optimisticId' in message.payload && (typeof message.payload.optimisticId === 'string' || typeof message.payload.optimisticId === 'undefined'))
      || !('optimisticId' in message.payload)
    );
};

/**
 * A ProjectionSetMessage represents setting the projection for a client.
 */
export interface ProjectionSetMessage<Projection>{
  type: 'projection/set',
  payload: { domain: string, projection: Projection },
}

/**
 * Verify that a message is a ProjectionSetMessage.
 *
 * @param message The message to check.
 */
export const isProjectionSetMessage = <Projection>(message: Message): message is ProjectionSetMessage<Projection> => {
  return message.type === 'projection/set'
    && typeof message.payload === 'object'
    && message.payload !== null
    && 'domain' in message.payload
    && typeof message.payload.domain === 'string'
    && 'projection' in message.payload;
};

/**
 * A ProjectionInvalidateMessage represents an invalidation of a specific optimistic id in a projection.
 */
export interface ProjectionInvalidateMessage {
  type: 'projection/invalidate',
  payload: { domain: string, optimisticId: string },
}

/**
 * Verify that a message is a ProjectionInvalidateMessage.
 *
 * @param message The message to check.
 */
export const isProjectionInvalidateMessage = (message: Message): message is ProjectionInvalidateMessage => {
  return message.type === 'projection/invalidate'
    && typeof message.payload === 'object'
    && message.payload !== null
    && 'domain' in message.payload
    && typeof message.payload.domain === 'string'
    && 'optimisticId' in message.payload
    && typeof message.payload.optimisticId === 'string';
};

/**
 * A ProjectionActionMessage represents an action that is sent from the client to the server.
 */
export interface ProjectionActionMessage {
  type: 'projection/action',
  payload: { domain: string, action: Message, optimisticId?: string },
}

/**
 * Verify that a message is a ProjectionActionMessage.
 *
 * @param message The message to check.
 */
export const isProjectionActionMessage = (message: Message): message is ProjectionActionMessage => {
  return message.type === 'projection/action'
    && typeof message.payload === 'object'
    && message.payload !== null
    && 'domain' in message.payload
    && typeof message.payload.domain === 'string'
    && (
      ('optimisticId' in message.payload && (typeof message.payload.optimisticId === 'string' || typeof message.payload.optimisticId === 'undefined'))
      || !('optimisticId' in message.payload)
    )
    && 'action' in message.payload
    && typeof message.payload.action === 'object'
    && message.payload.action !== null
    && 'type' in message.payload.action
    && typeof message.payload.action.type === 'string';
};
