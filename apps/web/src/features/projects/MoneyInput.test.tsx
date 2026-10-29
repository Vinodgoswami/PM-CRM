import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import { MoneyInput } from './MoneyInput';

test('valid amounts report minor units; malformed ones report a message', async () => {
  const onValue = vi.fn();
  render(<MoneyInput aria-label="Amount" currency="INR" onValue={onValue} />);
  const input = screen.getByLabelText('Amount');
  await userEvent.type(input, '1,25,000.50');
  expect(onValue).toHaveBeenLastCalledWith(12500050, null);
  await userEvent.clear(input);
  await userEvent.type(input, '12.345');
  expect(onValue).toHaveBeenLastCalledWith(null, 'Enter an amount like 1,25,000.50');
  await userEvent.clear(input);
  await userEvent.type(input, '0');
  expect(onValue).toHaveBeenLastCalledWith(null, 'Enter an amount above zero');
});

test('an existing amount is shown without rounding', () => {
  render(<MoneyInput aria-label="Amount" currency="INR" defaultMinor={12500050} onValue={() => {}} />);
  expect(screen.getByLabelText('Amount')).toHaveValue('125000.50');
});
