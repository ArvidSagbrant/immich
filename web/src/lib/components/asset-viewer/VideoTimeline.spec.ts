import VideoTimeline from '#lib/components/asset-viewer/VideoTimeline.svelte';
import { render } from 'vitest-browser-svelte';

describe('VideoTimeline', () => {
  const chapters = [
    { startTime: 0, endTime: 5, title: 'Intro' },
    { startTime: 5, endTime: 10, title: 'End' },
  ];

  it('places chapter markers on the playback timeline', async () => {
    const { baseElement } = await render(VideoTimeline, { chapters, duration: 10 });
    const markers = baseElement.querySelectorAll(':scope [aria-hidden] span');
    expect(markers).toHaveLength(1);
    expect((markers[0] as HTMLElement).style.left).toBe('50%');
    expect(baseElement.querySelector('immich-time-range')).not.toBeNull();
  });

  it.each([0, NaN, Infinity])('omits markers when duration is unavailable: %s', async (duration) => {
    const { baseElement } = await render(VideoTimeline, { chapters, duration });
    expect(baseElement.querySelector('[aria-hidden]')).toBeNull();
  });

  it('shows the normal seek bar for videos without chapters', async () => {
    const { baseElement } = await render(VideoTimeline, { chapters: [], duration: 10 });
    expect(baseElement.querySelectorAll(':scope [aria-hidden] span')).toHaveLength(0);
    expect(baseElement.querySelector('immich-time-range')).not.toBeNull();
  });
});
