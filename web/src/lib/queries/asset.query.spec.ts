import { getAssetChaptersQuery } from '#lib/queries/asset.query.ts';
import { queryClient } from '#lib/queries/client.ts';
import { test } from '#test/unit/fixtures.ts';
import { setPage } from '#test/unit/mocks/app-state.svelte.ts';

test('loads chapters for an authenticated asset', async ({ api }) => {
  const chapters = [{ startTime: 0, endTime: 5, title: 'Intro' }];
  api.on({ getAssetChapters: () => ({ json: chapters }) });
  await expect(queryClient.query(getAssetChaptersQuery('asset-1', null))).resolves.toEqual(chapters);
  expect(api.getAssetChapters).toHaveBeenCalledWith({ params: { id: 'asset-1' } });
});

test('includes the shared-link key in chapter requests and cache keys', async ({ api }) => {
  setPage({ route: { id: '/(user)/share/[key]/[[photos=photos]]/[[assetId=id]]' }, params: { key: 'share-key' } });
  const options = getAssetChaptersQuery('asset-1', 'version-1');
  await expect(queryClient.query(options)).resolves.toEqual([]);
  expect(api.getAssetChapters).toHaveBeenCalledWith({ params: { id: 'asset-1', key: 'share-key' } });
  expect(options.queryKey).toContainEqual({ key: 'share-key', slug: undefined });
});

test('refetches chapter metadata after the asset cache key changes', async ({ api }) => {
  await queryClient.query(getAssetChaptersQuery('asset-1', 'version-1'));
  await queryClient.query(getAssetChaptersQuery('asset-1', 'version-2'));
  expect(api.getAssetChapters.calls).toHaveLength(2);
});
