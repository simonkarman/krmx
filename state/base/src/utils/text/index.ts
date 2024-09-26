/**
 * Capitalize the first letter of a string.
 * @param s The string to capitalize.
 */
export const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Enumerate a list of strings.
 * @param s The list of strings to enumerate.
 * @param word The word to use before the last item.
 */
export const enumerate = (s: string[], word = 'and') => s.length === 1
  ? s[0]
  : `${s.slice(0, -1).join(', ')} ${word} ${s.slice(-1)[0]}`;
