import { authManager } from '#lib/managers/auth-manager.svelte.ts';
import { getAssetChapters } from '@immich/sdk';
import { queryOptions } from '@tanstack/svelte-query';

export const assetChaptersQueryKey = ['asset-chapters'];

export const getAssetChaptersQuery = (id: string, cacheKey: string | null) =>
  queryOptions({
    queryKey: [...assetChaptersQueryKey, id, cacheKey, authManager.params],
    queryFn: ({ signal }) => getAssetChapters({ id, ...authManager.params }, { signal }),
  });
