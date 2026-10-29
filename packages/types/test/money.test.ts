import { expect, test } from 'vitest';
import { formatMoney, minorFromJson, minorToJson, MoneyParseError, sumMinor, toMinor } from '../src/money';

test('M-1 toMinor parses exact decimals', () => {
  expect(toMinor('1250', 'INR')).toBe(125000n);
  expect(toMinor('1,25,000.50', 'INR')).toBe(12500050n);
  expect(toMinor('0.1', 'USD')).toBe(10n);
  expect(toMinor(' 99.99 ', 'USD')).toBe(9999n);
});

test.each(['12.345', '-5', '', '1e5', 'abc', '1.2.3', ',100', '1,500,00', '1,000,00', '12,345,67', '1,0000'])(
  'M-1 toMinor rejects %j',
  (s) => expect(() => toMinor(s, 'INR')).toThrow(MoneyParseError),
);

test('M-1 toMinor accepts valid Indian and western grouping', () => {
  expect(toMinor('12,34,56,789', 'INR')).toBe(12345678900n);
  expect(toMinor('1,250,000.75', 'USD')).toBe(125000075n);
  expect(toMinor('1,000', 'INR')).toBe(100000n);
});

test('M-1 toMinor respects currencies without minor units', () => {
  expect(toMinor('1500', 'JPY')).toBe(1500n);
  expect(() => toMinor('15.5', 'JPY')).toThrow(MoneyParseError);
});

test('M-2 formatMoney uses locale and currency', () => {
  expect(formatMoney(12500050n, 'INR')).toBe('₹1,25,000.50');
  expect(formatMoney(1250000n, 'USD', 'en-US')).toBe('$12,500.00');
});

test('M-2 formatMoney handles negatives and small values', () => {
  expect(formatMoney(-5n, 'INR')).toBe('-₹0.05');
  expect(formatMoney(0n, 'INR')).toBe('₹0.00');
});

test('sumMinor adds exactly', () => {
  expect(sumMinor([10n, 20n, -5n])).toBe(25n);
  expect(sumMinor([])).toBe(0n);
});

test('minorToJson guards precision', () => {
  expect(minorToJson(123n)).toBe(123);
  expect(() => minorToJson(2n ** 60n)).toThrow(RangeError);
  expect(minorFromJson(125000)).toBe(125000n);
  expect(() => minorFromJson(1.5)).toThrow(RangeError);
});
