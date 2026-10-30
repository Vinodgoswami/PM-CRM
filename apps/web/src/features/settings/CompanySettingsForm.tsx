import { type Settings, updateSettingsSchema } from '@salescrm/schemas';
import { Button, Card, Input, Label, Skeleton, toast } from '@salescrm/ui';
import { useState } from 'react';
import { can } from '@salescrm/auth/permissions';
import { useSession } from '../auth/api';
import { OptionSelect } from '../../components/OptionSelect';
import { useSettings, useUpdateSettings } from './api';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function CompanySettingsForm() {
  const { data } = useSettings();
  if (!data) return <Skeleton className="h-48 w-full" />;
  return <Form initial={data} />;
}

function Form({ initial }: { initial: Settings }) {
  const save = useUpdateSettings();
  // D-021: the Admin may only rename the company; the rest is the CEO's.
  const { data: session } = useSession();
  const locked = !session || !can(session.user, 'settings.manage');
  const [values, setValues] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => setValues((v) => ({ ...v, [key]: value }));

  return (
    <Card className="max-w-2xl">
      <form
        noValidate
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          // Send only what changed, so the audit log records exactly the edit.
          const changed = Object.fromEntries(Object.entries(values).filter(([k, v]) => initial[k as keyof Settings] !== v));
          const parsed = updateSettingsSchema.safeParse(changed);
          if (!parsed.success) return setError(parsed.error.issues[0]!.message);
          if (Object.keys(parsed.data).length === 0) return toast('Nothing to save');
          setError(null);
          save.mutate(parsed.data, { onSuccess: () => toast.success('Settings saved'), onError: (err) => setError(err.message) });
        }}
      >
        {locked && <p className="text-sm text-text-muted">Currency, financial year, time zone and due-soon days are set by the CEO.</p>}
        <div className="space-y-1.5">
          <Label htmlFor="s-company">Company name</Label>
          <Input id="s-company" value={values.companyName} onChange={(e) => set('companyName', e.target.value)} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="s-currency">Base currency</Label>
            <Input
              id="s-currency"
              disabled={locked}
              maxLength={3}
              value={values.baseCurrency}
              onChange={(e) => set('baseCurrency', e.target.value.toUpperCase())}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="s-fy">Financial year starts in</Label>
            <OptionSelect
              id="s-fy"
              disabled={locked}
              className="h-9 w-full rounded-md border border-border bg-surface px-3 text-sm"
              value={String(values.fyStartMonth)}
              onValueChange={(v) => set('fyStartMonth', Number(v))}
            >
              {MONTHS.map((m, i) => (
                <option key={m} value={i + 1}>
                  {m}
                </option>
              ))}
            </OptionSelect>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="s-tz">Timezone</Label>
            <Input id="s-tz" disabled={locked} value={values.timezone} onChange={(e) => set('timezone', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="s-due">Due soon (days)</Label>
            <Input
              id="s-due"
              disabled={locked}
              type="number"
              min={1}
              max={60}
              value={values.dueSoonDays}
              onChange={(e) => set('dueSoonDays', Number(e.target.value))}
            />
          </div>
        </div>
        {error && <p className="text-sm text-danger">{error}</p>}
        <div className="flex justify-end">
          <Button type="submit" disabled={save.isPending}>
            Save settings
          </Button>
        </div>
      </form>
    </Card>
  );
}
