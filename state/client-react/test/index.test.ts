import { VERSION } from '../src';

describe('Krmx State Client React', () => {
  it('should export a version', () => {
    expect(VERSION.length).toBeTruthy();
  });
});
