import { useSyncExternalStore } from 'react';
import { Client } from '@krmx/client';
import { Atom, AtomSetMessage, isAtomSetMessage } from '@krmx/state';

/**
 * Register support for atoms on this client using React hooks.
 */
export const registerAtoms = (client: Client): <T extends Atom>(key: string, def: T) => [
  value: T,
  setter: ((v: (T) | ((v: T) => T)) => boolean),
] => {
  if (client.getStatus() === 'linked') {
    throw new Error(
      'supportEventSource cannot be called with a client that is already linked to a user, as messages sent after linking but prior '
      + 'to the event source being created would be lost.',
    );
  }

  // State
  let atoms = {} as { [key: string]: Atom };

  // Create listeners
  type Listener = () => void;
  let listeners: Listener[] = [];
  function subscribe(listener: Listener) {
    listeners = [...listeners, listener];
    return () => {
      listeners = listeners.filter(l => l !== listener);
    };
  }

  // Emit the state to the external state
  function emit() {
    listeners.forEach(l => l());
  }

  // Reset state when the client itself unlinks
  const resetIfSelf = (username: string) => {
    if (username === client.getUsername()) {
      atoms = {};
      emit();
    }
  };
  client.on('link', resetIfSelf);
  client.on('unlink', resetIfSelf);

  // Allow the state to be altered once messages are received
  client.on('message', (message) => {
    if (!isAtomSetMessage(message)) {
      return;
    }
    atoms[message.payload.key] = message.payload.atom;
    emit(); // TODO: optimize by only re-rendering the component that uses this specific atom
  });

  return <T extends Atom>(key: string, defaultAtom: T): [
    value: T,
    setter: (v: T | ((v: T) => T)) => boolean,
  ] => {
    const fromState = useSyncExternalStore(subscribe, () => atoms, () => atoms)[key] as T | undefined;
    const curr = fromState === undefined ? defaultAtom : fromState;
    const set = (_atom: (T) | ((v: T) => T)): boolean => {
      if (client.getStatus() !== 'linked') {
        return false;
      }
      const next = typeof _atom === 'function' ? _atom(curr) : _atom;
      client.send<AtomSetMessage>({ type: 'atom/set', payload: { key, atom: next } });
      return true;
    };
    return [curr, set];
  };
};
