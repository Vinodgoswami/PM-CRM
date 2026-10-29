import { Card, CardDescription, CardTitle } from '@salescrm/ui';
import { type ReactNode } from 'react';

export function AuthCard({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <Card className="w-full max-w-sm space-y-6">
        <div className="space-y-1">
          <p className="text-sm font-semibold text-primary">SalesCRM</p>
          <CardTitle>{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </div>
        {children}
      </Card>
    </main>
  );
}
