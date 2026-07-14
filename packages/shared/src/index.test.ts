import { describe, expect, it } from 'vitest';
import { SHARED_PACKAGE_NAME } from './index';

describe('scaffold sanity', () => {
  it('exports the package name', () => {
    expect(SHARED_PACKAGE_NAME).toBe('@web-basket/shared');
  });
});
