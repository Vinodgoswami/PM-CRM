const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');

/** A user's profile photo, or their initials when they have none. */
export function Avatar({ name, url, className = 'size-9 text-xs' }: { name: string; url: string | null; className?: string }) {
  return url ? (
    <img src={url} alt={name} className={`shrink-0 rounded-full object-cover ${className}`} />
  ) : (
    <span aria-hidden className={`grid shrink-0 place-items-center rounded-full bg-accent font-bold text-primary ${className}`}>
      {initialsOf(name)}
    </span>
  );
}
