import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';

// Tests must stub every request they make (see stubApi); a real network call is a test bug.
beforeEach(() => {
  vi.stubGlobal('fetch', (input: unknown) => Promise.reject(new Error(`Unstubbed fetch: ${String(input)}`)));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

// cmdk / Radix measure elements; happy-dom has no layout engine.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;
Element.prototype.scrollIntoView ??= function scrollIntoView() {};
