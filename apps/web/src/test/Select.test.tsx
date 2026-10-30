import { Select } from '@salescrm/ui';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { expect, test, vi } from 'vitest';

const OPTIONS = [
  { value: '', label: 'Everyone' },
  { value: 'u1', label: 'Asha Mehta' },
  { value: 'u2', label: 'Meera Iyer' },
  { value: 'u3', label: 'Rohan Mehta' },
];

function Harness({ onChange = () => {}, disabled = false }: { onChange?: (v: string) => void; disabled?: boolean }) {
  const [value, setValue] = useState('');
  return (
    <>
      <label htmlFor="pm">Project manager</label>
      <Select
        id="pm"
        value={value}
        options={OPTIONS}
        disabled={disabled}
        onValueChange={(v) => {
          setValue(v);
          onChange(v);
        }}
      />
    </>
  );
}

test('a labelled button shows the chosen option; clicking opens a list of options below it', async () => {
  const user = userEvent.setup();
  render(<Harness />);
  const trigger = screen.getByLabelText('Project manager');
  expect(trigger).toHaveRole('combobox');
  expect(trigger).toHaveTextContent('Everyone');
  expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await user.click(trigger);
  const list = await screen.findByRole('listbox');
  expect(list).toHaveAttribute('data-side', 'bottom');
  expect(
    within(list)
      .getAllByRole('option')
      .map((o) => o.textContent),
  ).toEqual(OPTIONS.map((o) => o.label));
  expect(within(list).getByRole('option', { name: 'Everyone' })).toHaveAttribute('aria-selected', 'true');
});

test('choosing an option reports its value, closes the list and shows it', async () => {
  const onChange = vi.fn();
  const user = userEvent.setup();
  render(<Harness onChange={onChange} />);
  await user.click(screen.getByLabelText('Project manager'));
  await user.click(await screen.findByRole('option', { name: 'Meera Iyer' }));
  expect(onChange).toHaveBeenCalledWith('u2');
  expect(screen.queryByRole('listbox')).toBeNull();
  expect(screen.getByLabelText('Project manager')).toHaveTextContent('Meera Iyer');
  expect(screen.getByLabelText('Project manager')).toHaveFocus();
});

test('keyboard: arrows move, Enter picks, Escape closes without changing', async () => {
  const onChange = vi.fn();
  const user = userEvent.setup();
  render(<Harness onChange={onChange} />);
  screen.getByLabelText('Project manager').focus();
  await user.keyboard('{ArrowDown}');
  await screen.findByRole('listbox');
  await user.keyboard('{ArrowDown}{ArrowDown}{Enter}');
  expect(onChange).toHaveBeenLastCalledWith('u2');
  await user.keyboard('{ArrowDown}');
  await screen.findByRole('listbox');
  await user.keyboard('{End}{Escape}');
  expect(screen.queryByRole('listbox')).toBeNull();
  expect(onChange).toHaveBeenCalledTimes(1);
});

test('typing a letter jumps to the next option starting with it', async () => {
  const onChange = vi.fn();
  const user = userEvent.setup();
  render(<Harness onChange={onChange} />);
  await user.click(screen.getByLabelText('Project manager'));
  await screen.findByRole('listbox');
  await user.keyboard('r{Enter}');
  expect(onChange).toHaveBeenLastCalledWith('u3');
});

test('a disabled select cannot be opened', async () => {
  const user = userEvent.setup();
  render(<Harness disabled />);
  const trigger = screen.getByLabelText('Project manager');
  expect(trigger).toBeDisabled();
  await user.click(trigger);
  expect(screen.queryByRole('listbox')).toBeNull();
});
