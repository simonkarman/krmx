import { Message } from '@krmx/base';
import { Server } from '@krmx/server';
import { StreamModel, StreamProps, StreamAppendMessage, isStreamAppendMessage } from '@krmx/state';

/**
 * Register a stream to the server.
 *
 * @param server The server to register the stream model on.
 * @param domain The domain of the stream model.
 * @param model The stream model to register.
 * @param props The configuration for the stream.
 *
 * @returns An object with methods to unregister the stream and to subscribe to the stream and dispatch events to the stream.
 */
export const registerStream = (server: Server, domain: string, model: StreamModel<unknown>, props: StreamProps) => {
  const stream = model.spawn(props);
  const history: { domain: string, dispatcher: string, event: Message }[] = [];

  // Allow dispatching of events
  const dispatch = (dispatcher: string, event: Message) => {
    const result = stream.dispatch(dispatcher, event);
    if (result !== true) {
      // TODO: optimistic event should be invalidated at the client
      return;
    }
    const streamAppendMessage: StreamAppendMessage = {
      type: 'stream/append',
      payload: { domain, dispatcher, event },
    };
    history.push(streamAppendMessage.payload);
    server.broadcast<StreamAppendMessage>(streamAppendMessage);
  };

  // When a user sends a stream/append message, try and append the inner event to the stream
  const offMessage = server.on('message', (username, message) => {
    if (!isStreamAppendMessage(message) || message.payload.domain !== domain) {
      return;
    }
    dispatch(username, message.payload.event);
  });

  // Whenever a user links, send it the history of events
  const offLink = server.on('link', (username) => {
    history.forEach(payload => server.send<StreamAppendMessage>(username, {
      type: 'stream/append',
      payload,
    }));
  });

  return {
    /**
     * Unregister this model from the server.
     */
    unregister: () => {
      offMessage();
      offLink();
    },

    /**
     * Append an event to the state.
     */
    dispatch,
  };
};
