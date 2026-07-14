// Adds DOM-aware matchers (toBeInTheDocument, toHaveTextContent, …) to
// vitest's expect.
import '@testing-library/jest-dom/vitest';

import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// RTL auto-registers this only when test-framework globals are enabled;
// we run without globals, so unmount rendered trees between tests here.
afterEach(() => {
  cleanup();
});
