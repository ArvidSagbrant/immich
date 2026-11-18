<script lang="ts">
  import { getAssetVideoPreviewUrl } from '#lib/utils.ts';
  import type { AssetChapterResponseDto } from '@immich/sdk';
  import { MediaUIEvents } from 'media-chrome/constants';
  import './immich-time-range.ts';

  let { assetId, chapters, duration }: { assetId: string; chapters: AssetChapterResponseDto[]; duration: number } =
    $props();

  let range: HTMLElement | undefined = $state();
  let pointerTime: number | null = $state(null);
  let requestedUrl: string | undefined = $state();
  let imageReady = $state(false);
  const previewUrl = $derived.by(() => {
    if (pointerTime === null || !Number.isFinite(pointerTime) || !Number.isFinite(duration) || duration <= 0) {
      return;
    }
    const interval = Math.max(1, Math.ceil(duration / 120));
    const time = Math.max(0, Math.min(pointerTime, duration - 0.001));
    return getAssetVideoPreviewUrl(assetId, Math.floor(time / interval) * interval);
  });

  $effect(() => {
    const element = range;
    if (!element) {
      return;
    }
    const onPreview = (event: Event) => (pointerTime = (event as CustomEvent<number | null>).detail);
    element.addEventListener(MediaUIEvents.MEDIA_PREVIEW_REQUEST, onPreview);
    return () => element.removeEventListener(MediaUIEvents.MEDIA_PREVIEW_REQUEST, onPreview);
  });

  $effect(() => {
    const url = previewUrl;
    if (!url) {
      requestedUrl = undefined;
      return;
    }
    const timer = setTimeout(() => {
      requestedUrl = url;
      imageReady = false;
    }, 120);
    return () => clearTimeout(timer);
  });
</script>

<div class="relative h-8 w-full px-2 pb-3">
  <immich-time-range bind:this={range} class="size-full rounded-lg outline-none">
    <div slot="preview" class="flex flex-col items-center overflow-hidden rounded-lg bg-black/85 text-white shadow-md">
      {#if requestedUrl && requestedUrl === previewUrl}
        {#key requestedUrl}
          <img
            src={requestedUrl}
            alt=""
            class="max-h-27 max-w-48 object-contain"
            class:hidden={!imageReady}
            onload={() => (imageReady = true)}
          />
        {/key}
      {/if}
      <media-preview-time-display class="px-2 py-1 text-xs"></media-preview-time-display>
    </div>
  </immich-time-range>
  {#if Number.isFinite(duration) && duration > 0}
    <div aria-hidden="true" class="pointer-events-none absolute inset-x-2 top-0 h-5">
      {#each chapters as chapter (chapter.startTime)}
        {#if chapter.startTime > 0 && chapter.startTime < duration}
          <span class="absolute top-1.5 h-2 w-0.5 bg-dark/80" style:left={`${(chapter.startTime / duration) * 100}%`}
          ></span>
        {/if}
      {/each}
    </div>
  {/if}
</div>
