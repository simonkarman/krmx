export interface LinkMessage { type: 'krmx/link', payload: { username: string, version: string, auth?: string } }
export interface UnlinkMessage { type: 'krmx/unlink' }
export interface LeaveMessage { type: 'krmx/leave' }
export type FromConnectionMessage = LinkMessage | UnlinkMessage | LeaveMessage;

export interface RejectedMessage { type: 'krmx/rejected', payload: { reason: string } }
export interface AcceptedMessage { type: 'krmx/accepted' }
export interface JoinedMessage { type: 'krmx/joined', payload: { username: string } }
export interface LinkedMessage { type: 'krmx/linked', payload: { username: string } }
export interface UnlinkedMessage { type: 'krmx/unlinked', payload: { username: string } }
export interface LeftMessage { type: 'krmx/left', payload: { username: string } }
export type FromServerMessage = RejectedMessage | AcceptedMessage | JoinedMessage |
  LinkedMessage | UnlinkedMessage | LeftMessage;
