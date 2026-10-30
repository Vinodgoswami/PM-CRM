import { Button, Input, Label, toast } from '@salescrm/ui';
import { Copy } from 'lucide-react';
import { useId } from 'react';

/** A one-time invite / reset link: says whether it was emailed, and always offers it to copy and share by hand. */
export function LinkPanel({
  url,
  expiresAt,
  note,
  emailed,
  to,
  what = 'Invite',
}: {
  url: string;
  expiresAt: string;
  note: string;
  emailed?: boolean;
  to?: string;
  what?: 'Invite' | 'Reset link';
}) {
  const id = useId();
  return (
    <div className="space-y-2 rounded-md bg-accent p-3">
      {to && (
        <p role="status" className={`text-sm font-semibold ${emailed ? 'text-primary' : 'text-danger'}`}>
          {emailed ? `${what} emailed to ${to}.` : `Not emailed. Copy the link below and send it to ${to} yourself.`}
        </p>
      )}
      <Label htmlFor={id}>Link to share</Label>
      <div className="flex gap-2">
        <Input id={id} readOnly value={url} onFocus={(e) => e.target.select()} />
        <Button
          type="button"
          variant="outline"
          onClick={async () => {
            await navigator.clipboard.writeText(url);
            toast.success('Link copied');
          }}
        >
          <Copy className="size-4" /> Copy link
        </Button>
      </div>
      <p className="text-xs text-text-muted">
        {note} Expires {new Date(expiresAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}.
      </p>
    </div>
  );
}
