import { Route } from '#lib/route.ts';
import { factory } from '#test/common/factories.ts';
import { expect, test } from '#test/medium/fixtures.ts';
import { AssetTypeEnum, SharedLinkType } from '@immich/sdk';
import { readFileSync } from 'node:fs';

const videoData = new Uint8Array(
  readFileSync(new URL('../../../../../server/test/fixtures/chapters/no-chapters.mp4', import.meta.url)),
);
const videoResponse = {
  status: 206,
  body: videoData,
  contentType: 'video/mp4',
  headers: {
    'Accept-Ranges': 'bytes',
    'Content-Range': `bytes 0-${videoData.length - 1}/${videoData.length}`,
  },
};
const chapters = [
  { startTime: 0, endTime: 1, title: 'Intro' },
  { startTime: 1, endTime: 2, title: 'Snow = 雪' },
  { startTime: 2, endTime: 3, title: null },
];

test.afterEach(async ({ page }) => {
  await page.evaluate(() => {
    localStorage.removeItem('always-load-original-video');
    localStorage.removeItem('auto-play-video');
  });
});

for (const playback of ['original', 'transcoded', 'shared-link']) {
  test(`seeks embedded chapters during ${playback} playback`, async ({ page, context, data, api }) => {
    data.publicConfig.ffmpeg.realtime.enabled = false;
    const asset = factory.asset({
      type: AssetTypeEnum.Video,
      originalFileName: 'chapters.mp4',
      originalMimeType: 'video/mp4',
      duration: 3000,
      width: 32,
      height: 32,
    });
    data.addAssets(asset);
    api.on({
      getAssetChapters: () => ({ json: chapters }),
      playAssetVideo: () => videoResponse,
      downloadAsset: () => videoResponse,
    });

    await page.goto(Route.photos());
    await page.evaluate((original) => {
      localStorage.setItem('always-load-original-video', JSON.stringify(original));
      localStorage.setItem('auto-play-video', 'false');
    }, playback === 'original');

    let sharedKey: string | undefined;
    if (playback === 'shared-link') {
      const link = factory.sharedLink({
        type: SharedLinkType.Individual,
        assets: [asset],
        showExif: false,
        allowDownload: false,
      });
      data.addSharedLinks(link);
      sharedKey = link.key;
      await context.clearCookies();
      await page.goto(Route.viewSharedLink(link));
    } else {
      await page.goto(Route.viewAsset(asset));
    }

    const video = page.locator('media-controller video[slot="media"]');
    await expect
      .poll(() => video.evaluate((element: HTMLVideoElement) => element.readyState))
      .toBeGreaterThanOrEqual(1);
    const source = await video.getAttribute('src');
    expect(source).toContain(playback === 'original' ? '/original' : '/video/playback');
    await page.getByTitle('video_chapters', { exact: true }).click();
    const chapter = page.getByRole('button', { name: '0:01 Snow = 雪' });
    await expect(chapter).toBeEnabled();
    expect((await chapter.boundingBox())!.height).toBeGreaterThanOrEqual(40);
    await chapter.click();
    await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.currentTime)).toBeCloseTo(1, 2);
    await expect(video).toHaveAttribute('src', source!);
    await expect(page.locator('immich-time-range').locator('..').locator('[aria-hidden] > span')).toHaveCount(2);
    if (playback === 'transcoded') {
      await page.getByTitle('video_chapters', { exact: true }).focus();
      await page.keyboard.press('Enter');
      await page.keyboard.press('Tab');
      await page.keyboard.press('Enter');
      await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.currentTime)).toBe(0);
      await expect(video).toHaveJSProperty('paused', true);
    }
    expect(api.getAssetChapters).toHaveBeenCalledWith({
      params: expect.objectContaining({ id: asset.id, ...(sharedKey && { key: sharedKey }) }),
    });
  });
}
