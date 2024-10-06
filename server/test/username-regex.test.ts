import { usernameRegex as regex } from '../src';

describe('Username Regex Tests', () => {
  // Test for string length
  test('fails for strings less than 2 or greater than 32 characters', () => {
    expect('a').not.toMatch(regex);
    expect('a'.repeat(33)).not.toMatch(regex);
    expect('ab').toMatch(regex);
    expect('a'.repeat(32)).toMatch(regex);
  });

  // Test for allowed characters
  test('only succeeds for strings with allowed characters', () => {
    expect('a.b-c@A_BC123').toMatch(regex);
    expect('inval!d').not.toMatch(regex);
    expect('i$valid').not.toMatch(regex);
    expect('inv#lid').not.toMatch(regex);
  });

  // Test for consecutive special characters
  test('fails for strings with two or more consecutive special characters', () => {
    expect('a.1b').toMatch(regex);
    expect('a9@b').toMatch(regex);
    expect('a..b').not.toMatch(regex);
    expect('a--b').not.toMatch(regex);
    expect('a@@b').not.toMatch(regex);
    expect('a__b').not.toMatch(regex);
    expect('a.-b').not.toMatch(regex);
    expect('a_@b').not.toMatch(regex);
    expect('a@.b').not.toMatch(regex);
    expect('a-_b').not.toMatch(regex);
    expect('i.nvalid.exampl-e').toMatch(regex);
  });

  // Test for starting character
  test('fails for strings that don\'t start or end with a-z or A-Z', () => {
    expect('validStart').toMatch(regex);
    expect('ValidStart').toMatch(regex);
    expect('1invalidStart').not.toMatch(regex);
    expect('@invalidStart').not.toMatch(regex);
    expect('.invalidStart').not.toMatch(regex);
    expect('_invalidStart').not.toMatch(regex);
    expect('-invalidStart').not.toMatch(regex);

    expect('ValidEnd9').toMatch(regex);
    expect('invalidEnd_').not.toMatch(regex);
    expect('invalidEnd.').not.toMatch(regex);
    expect('invalidEnd@').not.toMatch(regex);
    expect('invalidEnd-').not.toMatch(regex);
  });

  // Additional test cases
  test('various valid and invalid examples', () => {
    expect('valid-example123').toMatch(regex);
    expect('Another.Valid_Example').toMatch(regex);
    expect('a@b.c-d_e').toMatch(regex);
    expect('ab').toMatch(regex);
    expect('A'.repeat(32)).toMatch(regex);

    expect('').not.toMatch(regex);
    expect('a').not.toMatch(regex);
    expect('invalid$example').not.toMatch(regex);
    expect('invalid space').not.toMatch(regex);
    expect('TooLong'.repeat(6)).not.toMatch(regex);
  });
});
