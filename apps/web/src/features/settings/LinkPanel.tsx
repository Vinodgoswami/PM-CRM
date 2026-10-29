import { Button, Input, Label, toast } from '@salescrm/ui';
import { Copy } from 'lucide-react';
import { useId } from 'react';

/** Shows a one-time invite / reset link for the Admin to share (D-010: no email in v1). */
export function LinkPanel({ url, expiresAt, note }: { url: string; expiresAt: string; note: string }) {
  const id = useId();
  return (
    <div className="space-y-2 rounded-md bg-accent p-3">
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
