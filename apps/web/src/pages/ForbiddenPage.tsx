import { Button } from '@salescrm/ui';
import { Link } from 'react-router';

export function ForbiddenPage() {
  return (
    <section className="space-y-3">
      <h1 className="text-2xl font-semibold">You don&apos;t have access to this page</h1>
      <p className="text-text-muted">Ask your admin if you think you should.</p>
      <Button asChild variant="outline">
        <Link to="/">Back to dashboard</Link>
      </Button>
    </section>
  );
}
