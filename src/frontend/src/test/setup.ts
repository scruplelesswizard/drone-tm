import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// vitest.config.ts doesn't set test.globals, so testing-library's own
// auto-cleanup (which relies on a global `afterEach`) never registers -
// wire it up explicitly instead.
afterEach(() => {
  cleanup();
});
