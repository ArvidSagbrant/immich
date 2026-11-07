import VideoChapterMenu from '#lib/components/asset-viewer/VideoChapterMenu.svelte';
import 'hls-video-element';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';

const chapters = [
  { startTime: 0, endTime: 1.25, title: 'Intro' },
  { startTime: 1.25, endTime: 3, title: 'Snow = 雪' },
  { startTime: 3, endTime: 4, title: null },
];

describe('VideoChapterMenu', () => {
  it.each(['video', 'hls-video'])('seeks %s playback to a chapter without replacing the source', async (tag) => {
    const player = document.createElement(tag) as HTMLVideoElement;
    await render(VideoChapterMenu, { chapters, player, ready: true, currentTime: 0 });
    await page.getByTitle('video_chapters', { exact: true }).click();
    await page.getByRole('button', { name: '0:01 Snow = 雪' }).click();
    expect(player.currentTime).toBe(1.25);
    expect(player.getAttribute('src')).toBeNull();
    await expect.element(page.getByTitle('video_chapters', { exact: true })).toHaveFocus();
  });

  it('hides chapter controls when no chapters exist', async () => {
    await render(VideoChapterMenu, { chapters: [], player: undefined, ready: false, currentTime: 0 });
    await expect.element(page.getByTitle('video_chapters', { exact: true })).not.toBeInTheDocument();
  });

  it('disables seeking until media metadata is loaded', async () => {
    await render(VideoChapterMenu, { chapters, player: undefined, ready: false, currentTime: 0 });
    await page.getByTitle('video_chapters', { exact: true }).click();
    await expect.element(page.getByRole('button', { name: '0:00 Intro' })).toBeDisabled();
  });

  it('marks the current chapter, provides missing titles and renders embedded markup as text', async () => {
    const { baseElement } = await render(VideoChapterMenu, {
      chapters: [...chapters, { startTime: 4, endTime: 5, title: '<img src=x onerror=alert(1)>' }],
      player: undefined,
      ready: true,
      currentTime: 1.5,
    });
    await page.getByTitle('video_chapters', { exact: true }).click();
    await expect.element(page.getByRole('button', { name: '0:01 Snow = 雪' })).toHaveAttribute('aria-current', 'true');
    await expect.element(page.getByRole('button', { name: /0:03 video_chapter/ })).toBeVisible();
    expect(baseElement.querySelector('img')).toBeNull();
  });
});
