export function PlaceholderPage({ title, phase }: { title: string; phase: number }) {
  return (
    <section className="space-y-2">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="text-text-muted">Coming in Phase {phase}.</p>
    </section>
  );
}
