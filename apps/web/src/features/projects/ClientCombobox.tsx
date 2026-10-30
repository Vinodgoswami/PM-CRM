import { Command, CommandEmpty, CommandInput, CommandItem, CommandList, Popover, PopoverContent, PopoverTrigger } from '@salescrm/ui';
import { Check, ChevronsUpDown, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useClients } from '../clients/api';

export type ClientChoice = { clientId: string; name: string; currency: string } | { newClient: { name: string; email?: string } } | null;

/** Client dropdown with "+ Add new client" (R1, C-1): new clients are created together with the project. */
export function ClientCombobox({
  id,
  value,
  onChange,
  invalid,
  allowNew = true,
}: {
  id: string;
  value: ClientChoice;
  onChange: (v: ClientChoice) => void;
  invalid?: boolean;
  /** Off when editing a project: it moves only to a client that already exists. */
  allowNew?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 200);
    return () => clearTimeout(t);
  }, [search]);
  const { data, isFetching } = useClients(new URLSearchParams({ ...(debounced ? { q: debounced } : {}), pageSize: '20' }).toString(), open);

  const label = !value ? 'Select a client' : 'clientId' in value ? value.name : `New client: ${value.newClient.name || '…'}`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-invalid={invalid || undefined}
          className="flex h-9 w-full items-center justify-between rounded-md border border-border bg-surface px-3 text-left text-sm aria-invalid:border-danger"
        >
          <span className={value ? '' : 'text-text-muted'}>{label}</span>
          <ChevronsUpDown className="size-4 text-text-muted" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent>
        <Command shouldFilter={false}>
          <CommandInput placeholder="Search clients…" value={search} onValueChange={setSearch} />
          <CommandList>
            {!isFetching && <CommandEmpty>No matching clients.</CommandEmpty>}
            {(data?.items ?? []).map((c) => (
              <CommandItem
                key={c.id}
                value={c.id}
                onSelect={() => {
                  onChange({ clientId: c.id, name: c.name, currency: c.currency });
                  setOpen(false);
                }}
              >
                <Check className={`size-4 ${value && 'clientId' in value && value.clientId === c.id ? '' : 'invisible'}`} aria-hidden />
                {c.name}
              </CommandItem>
            ))}
            {allowNew && (
              <CommandItem
                value="__new__"
                onSelect={() => {
                  onChange({ newClient: { name: search.trim() } });
                  setOpen(false);
                }}
              >
                <Plus className="size-4" aria-hidden /> Add new client{search.trim() ? ` “${search.trim()}”` : ''}
              </CommandItem>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
