/** Where the web app loads a user's photo; the `v` part changes with each new photo so browsers refetch it. */
export const avatarUrlFor = (userId: string, key: string | null): string | null =>
  key ? `/api/v1/users/${userId}/avatar?v=${key.split('/').pop()}` : null;
