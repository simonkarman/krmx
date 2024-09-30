import { Server } from '@krmx/server';
import { Atom, AtomSetMessage, isAtomSetMessage } from '@krmx/state';

/**
 * Properties to register the atom model to a server.
 */
type RegisterAtomModelProps = {
  /**
   * Clear all atoms when the server is empty.
   */
  clearOnEmptyServer?: boolean,

  /**
   * If set to true, atoms with a slash can only be set by a user with the username that prepends the slash.
   * For example, if the user's username is 'alice', only they can set atoms with keys like 'alice/rotation'.
   *
   * By default, or if set to false: all users can set any atom with or without slashes. Keep in mind that atoms without a slash are always allowed
   *  to be set by any user, regardless of this setting.
   */
  strictKeyPrefixes?: boolean,
};

/**
 * Register all atoms to the server.
 *
 * @param server The server to register the atom model on.
 * @param props The properties to configure the atom model.
 *
 * @returns An object with methods to unregister the model and to get and set atoms.
 */
export const registerAtoms = (server: Server, props: RegisterAtomModelProps) => {
  // Keep track of the atoms.
  let atoms: { [key: string]: Atom } = {};

  // Everytime a message is received, check if it is a set atom message, and if so, set the atom and broadcast it.
  const offMessage = server.on('message', (username, message) => {
    if (isAtomSetMessage(message)) {
      const { key, atom } = message.payload;
      if (props.strictKeyPrefixes === true && key.includes('/') && !key.startsWith(`${username}/`)) {
        return;
      }
      atoms[key] = atom;
      server.broadcast<AtomSetMessage>({ type: 'atom/set', payload: { key, atom } });
    }
  });

  // Everytime a client links, send all the atoms to the client.
  const offLink = server.on('link', (username) => {
    for (const key in atoms) {
      server.send<AtomSetMessage>(username, { type: 'atom/set', payload: { key, atom: atoms[key] } });
    }
  });

  // If configured to clear atoms when the server is empty, clear the atoms when the server is empty.
  const offLeave = props.clearOnEmptyServer
    ? server.on('leave', () => {
      if (server.getUsers().length === 0) {
        atoms = {};
      }
    })
    : () => { /* do nothing */ };

  // Return the methods to unregister, and to get and set atoms.
  return {
    /**
     * Unregister the atom model from the server.
     */
    unregister: () => {
      offMessage();
      offLink();
      offLeave();
    },

    /**
     * Get an atom.
     *
     * @param key The key of the atom to get.
     * @returns The atom.
     */
    get(key: string): Atom {
      return atoms[key];
    },

    /**
     * Sets an atom, which is immediately broadcast to all clients.
     *
     * @param key The key of the atom to set.
     * @param atom The atom.
     */
    set(key: string, atom: Atom) {
      atoms[key] = atom;
      server.broadcast<AtomSetMessage>({ type: 'atom/set', payload: { key, atom } });
    },

    /**
     * Get all keys.
     *
     * @returns The keys of the atoms.
     */
    getKeys(): string[] {
      return Object.keys(atoms);
    },
  };
};
