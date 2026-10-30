import { Button, Input, Label, toast } from '@salescrm/ui';
import { Copy, MailCheck, MailWarning } from 'lucide-react';
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
  const Icon = emailed ? MailCheck : MailWarning;
  return (
    <div className="space-y-4">
      {to && (
        <div
          className={`flex items-start gap-3 rounded-lg border p-3 ${
            emailed ? 'border-success/30 bg-success/10' : 'border-warning/40 bg-warning/10'
          }`}
        >
          <span
            className={`grid size-8 shrink-0 place-items-center rounded-full ${
              emailed ? 'bg-success/15 text-success' : 'bg-warning/20 text-warning'
            }`}
          >
            <Icon className="size-4" aria-hidden />
          </span>
          <p role="status" className="pt-1.5 text-sm font-medium">
            {emailed ? `${what} emailed to ${to}.` : `Not emailed. Copy the link below and send it to ${to} yourself.`}
          </p>
        </div>
      )}
      <div className="space-y-1.5">
        <Label htmlFor={id}>Link to share</Label>
        <div className="flex gap-2">
          <Input id={id} readOnly value={url} className="min-w-0 flex-1 font-mono text-xs" onFocus={(e) => e.target.select()} />
          <Button
            type="button"
            variant="outline"
            className="shrink-0 whitespace-nowrap"
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
    </div>
  );
}
