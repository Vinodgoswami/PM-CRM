import { expect, test } from 'vitest';
import { changedFields } from '../src/audit-diff';

test('only differing keys are kept, bigint as string', () => {
  expect(changedFields({ a: 1, b: 2n }, { a: 1, b: 3n })).toEqual({ before: { b: '2' }, after: { b: '3' } });
});

test('identical objects produce null', () => {
  expect(changedFields({ a: 1, b: 2n }, { a: 1, b: 2n })).toBeNull();
});

test('added and removed keys are recorded, dates as ISO strings', () => {
  const d = new Date('2026-10-29T00:00:00.000Z');
  expect(changedFields({ a: 1 }, { a: 1, when: d })).toEqual({ before: { when: null }, after: { when: '2026-10-29T00:00:00.000Z' } });
});
