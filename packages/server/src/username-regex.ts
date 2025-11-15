/**
 * Username regex that tests the following properties:
 *  - exclusive use of the following characters: letters (a-z and A-Z), numbers (0-9), dot (.), dash (-), at (@), and underscore (_)
 *  - at least 2 and at most 32 characters long
 *  - start with a letter
 *  - no consecutive special characters (a special character is a dot (.), dash (-), at (@), or underscore (_))
 */
export const usernameRegex = /^[a-zA-Z](?!.*[._@-]{2})[a-zA-Z0-9._@-]{0,30}[a-zA-Z0-9]$/;
