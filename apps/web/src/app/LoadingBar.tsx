import { useIsFetching, useIsMutating } from '@tanstack/react-query';

/** A thin bar at the top while anything is loading or saving, so a slow host never looks like missing data. */
export function LoadingBar() {
  const busy = useIsFetching() + useIsMutating() > 0;
  if (!busy) return null;
  return (
    <div
      role="progressbar"
      aria-label="Loading"
      className="pointer-events-none fixed inset-x-0 top-0 z-50 h-0.5 overflow-hidden print:hidden"
    >
      <div className="loading-bar h-full w-1/3 rounded-full bg-primary" />
    </div>
  );
}
