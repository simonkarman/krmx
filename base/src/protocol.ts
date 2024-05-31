/**
 * A message. It describes the type of the message and may contain a payload.
 */
export type Message = { type: string, payload?: unknown };

/**
 * A message consumer is a function without a return type that takes a single message as an input.
 */
export type MessageConsumer = <TMessage extends Message>(message: TMessage) => void;

/**
 * A Krmx message sent from the client to indicate a link request.
 */
export interface LinkMessage { type: 'krmx/link', payload: { username: string, version: string, auth?: string } }

/**
 * A Krmx message sent from the client to indicate an unlink request.
 */
export interface UnlinkMessage { type: 'krmx/unlink' }

/**
 * A Krmx message sent from the client to indicate a leave request.
 */
export interface LeaveMessage { type: 'krmx/leave' }

/**
 * Represents any of the possible Krmx messages sent from the client to the server.
 */
export type FromClientMessage = LinkMessage | UnlinkMessage | LeaveMessage;

/**
 * A Krmx message sent from the server to indicate a rejection of a link request.
 */
export interface RejectedMessage { type: 'krmx/rejected', payload: { reason: string } }

/**
 * A Krmx message sent from the server to indicate an acceptance of a link request.
 */
export interface AcceptedMessage { type: 'krmx/accepted' }

/**
 * A Krmx message sent from the server to indicate that a user has joined.
 */
export interface JoinedMessage { type: 'krmx/joined', payload: { username: string } }

/**
 * A Krmx message sent from the server to indicate that a user has linked.
 */
export interface LinkedMessage { type: 'krmx/linked', payload: { username: string } }

/**
 * A Krmx message sent from the server to indicate that a user has unlinked.
 */
export interface UnlinkedMessage { type: 'krmx/unlinked', payload: { username: string } }

/**
 * A Krmx message sent from the server to indicate that a user has left.
 */
export interface LeftMessage { type: 'krmx/left', payload: { username: string } }

/**
 * Represents any of the possible Krmx messages sent from the server to the client.
 */
export type FromServerMessage = RejectedMessage | AcceptedMessage | JoinedMessage |
  LinkedMessage | UnlinkedMessage | LeftMessage;

/**
 * Representation of a Krmx user.
 */
export interface User {
  /**
   * The name of the user.
   */
  username: string;

  /**
   * Whether the user is linked to a connection.
   */
  isLinked: boolean;
}
