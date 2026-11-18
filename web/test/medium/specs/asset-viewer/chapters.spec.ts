import { Route } from '#lib/route.ts';
import { factory } from '#test/common/factories.ts';
import { expect, test } from '#test/medium/fixtures.ts';
import { AssetTypeEnum, SharedLinkType } from '@immich/sdk';
import type HlsVideoElement from 'hls-video-element';
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
    const timeline = page.locator('immich-time-range');
    await expect(timeline.locator('..').locator('[aria-hidden] > span')).toHaveCount(2);
    const bounds = (await timeline.boundingBox())!;
    await timeline.hover({ position: { x: Math.round(bounds.width * 0.47), y: Math.round(bounds.height / 2) } });
    const preview = timeline.locator('[slot="preview"]');
    await expect(preview.locator('img')).toBeVisible();
    await expect(preview.locator('img')).toHaveAttribute('src', /[?&]time=1(?:&|$)/);
    await expect(preview.locator('media-preview-time-display')).toContainText('0:01');
    if (sharedKey) {
      await expect(preview.locator('img')).toHaveAttribute('src', /[?&]key=/);
    }
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

test('switches between Original and Auto without losing chapter navigation', async ({ page, data, api }) => {
  data.publicConfig.ffmpeg.realtime.enabled = true;
  const asset = factory.asset({ type: AssetTypeEnum.Video, duration: 3000, width: 32, height: 32 });
  const session = '08351af7-bf08-4914-bb52-fa4d56ade949';
  const video = readFileSync(new URL('fixtures/chapter-quality.mp4', import.meta.url));
  const mediaOffset = video.indexOf('moof') - 4;
  data.addAssets(asset);
  api.on({
    getAssetChapters: () => ({ json: chapters }),
    getMainPlaylist: () => ({
      body: [
        '#EXTM3U',
        '#EXT-X-VERSION:7',
        '#EXT-X-STREAM-INF:BANDWIDTH=10000,RESOLUTION=32x32,CODECS="avc1.64000a"',
        `${session}/0/playlist.m3u8`,
        '#EXT-X-STREAM-INF:BANDWIDTH=20000,RESOLUTION=32x32,CODECS="avc1.64000a",STABLE-VARIANT-ID="original"',
        `${session}/15/playlist.m3u8`,
        '',
      ].join('\n'),
      contentType: 'application/vnd.apple.mpegurl',
    }),
    getMediaPlaylist: () => ({
      body: [
        '#EXTM3U',
        '#EXT-X-VERSION:7',
        '#EXT-X-TARGETDURATION:3',
        '#EXT-X-MEDIA-SEQUENCE:0',
        '#EXT-X-MAP:URI="init.mp4"',
        '#EXTINF:3.0,',
        'seg_0.m4s',
        '#EXT-X-ENDLIST',
        '',
      ].join('\n'),
      contentType: 'application/vnd.apple.mpegurl',
    }),
    getSegment: ({ params }) => ({
      body: new Uint8Array(
        params.filename === 'init.mp4' ? video.subarray(0, mediaOffset) : video.subarray(mediaOffset),
      ),
      contentType: 'video/mp4',
    }),
    endSession: () => ({ status: 204 }),
  });

  await page.goto(Route.photos());
  await page.evaluate(() => localStorage.setItem('auto-play-video', 'false'));
  await page.goto(Route.viewAsset(asset));

  const player = page.locator('hls-video');
  await expect.poll(() => player.evaluate((element: HTMLVideoElement) => element.readyState)).toBeGreaterThanOrEqual(1);
  const openQualityMenu = async () => {
    await page.locator('media-settings-menu-button').click();
    await page
      .locator('media-settings-menu > media-settings-menu-item')
      .filter({ has: page.locator('immich-rendition-menu') })
      .click();
  };

  await openQualityMenu();
  const originalPlaylist = page.waitForResponse((response) => response.url().includes(`${session}/15/playlist.m3u8`));
  await page.getByRole('menuitemradio', { name: 'video_quality_original' }).click();
  await expect.poll(() => player.evaluate((element: HlsVideoElement) => element.api?.manualLevel)).toBe(1);
  const response = await originalPlaylist;
  expect(response.ok()).toBe(true);

  await page.getByTitle('video_chapters', { exact: true }).click();
  await page.getByRole('button', { name: '0:01 Snow = 雪' }).click();
  await expect.poll(() => player.evaluate((element: HTMLVideoElement) => element.currentTime)).toBeCloseTo(1, 2);

  await openQualityMenu();
  await page.locator('immich-rendition-menu [role="menuitemradio"][value="auto"]').click();
  await expect.poll(() => player.evaluate((element: HlsVideoElement) => element.api?.manualLevel)).toBe(-1);
  await page.goto(Route.photos());
});
