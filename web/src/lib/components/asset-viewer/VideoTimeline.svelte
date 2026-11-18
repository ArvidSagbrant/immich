<script lang="ts">
  import { getAssetVideoPreviewSheetUrl, getAssetVideoPreviewUrl } from '#lib/utils.ts';
  import type { AssetChapterResponseDto } from '@immich/sdk';
  import { MediaUIEvents } from 'media-chrome/constants';
  import './immich-time-range.ts';

  let { assetId, chapters, duration }: { assetId: string; chapters: AssetChapterResponseDto[]; duration: number } =
    $props();

  let range: HTMLElement | undefined = $state();
  let pointerTime: number | null = $state(null);
  let requestedUrl: string | undefined = $state();
  let imageReady = $state(false);
  let sheet = $state<{
    url: string;
    width: number;
    height: number;
    columns: number;
    interval: number;
    count: number;
  }>();
  const seekTime = $derived.by(() => {
    if (pointerTime === null || !Number.isFinite(pointerTime) || !Number.isFinite(duration) || duration <= 0) {
      return;
    }
    return Math.max(0, Math.min(pointerTime, duration - 0.001));
  });
  const previewUrl = $derived.by(() => {
    if (seekTime === undefined || sheet) {
      return;
    }
    const interval = Math.max(1, Math.ceil(duration / 120));
    return getAssetVideoPreviewUrl(assetId, Math.floor(seekTime / interval) * interval);
  });
  const cell = $derived(
    sheet && seekTime !== undefined ? Math.min(sheet.count - 1, Math.floor(seekTime / sheet.interval)) : undefined,
  );

  $effect(() => {
    const url = getAssetVideoPreviewSheetUrl(assetId);
    const request = new AbortController();
    let objectUrl: string | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;
    sheet = undefined;

    const preload = async (remaining: number) => {
      const response = await fetch(url, { signal: request.signal });
      if (response.status === 204 && remaining > 0) {
        retry = setTimeout(() => void preload(remaining - 1).catch(() => {}), 5000);
        return;
      }
      const layout = response.headers.get('X-Immich-Preview-Layout')?.split(',').map(Number);
      if (!response.ok || layout?.length !== 5 || layout.some((value) => !Number.isSafeInteger(value) || value <= 0)) {
        return;
      }
      const [width, height, columns, interval, count] = layout;
      const blob = await response.blob();
      if (request.signal.aborted) {
        return;
      }
      objectUrl = URL.createObjectURL(blob);
      const image = new Image();
      image.src = objectUrl;
      await image.decode();
      if (
        !request.signal.aborted &&
        image.naturalWidth === width * columns &&
        image.naturalHeight === height * Math.ceil(count / columns)
      ) {
        sheet = { url: objectUrl, width, height, columns, interval, count };
      }
    };

    void preload(12).catch(() => {});
    return () => {
      request.abort();
      clearTimeout(retry);
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
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
  <immich-time-range
    bind:this={range}
    class="size-full rounded-lg outline-none"
    style:--media-preview-transition-delay-in="0s"
    style:--media-preview-transition-duration-in="0s"
  >
    <div slot="preview" class="flex flex-col items-center overflow-hidden rounded-lg bg-black/85 text-white shadow-md">
      {#if sheet && cell !== undefined}
        <div class="relative overflow-hidden" style:width={`${sheet.width}px`} style:height={`${sheet.height}px`}>
          <img
            src={sheet.url}
            alt=""
            class="absolute max-w-none"
            style:width={`${sheet.width * sheet.columns}px`}
            style:left={`${-(cell % sheet.columns) * sheet.width}px`}
            style:top={`${-Math.floor(cell / sheet.columns) * sheet.height}px`}
          />
        </div>
      {:else if requestedUrl && requestedUrl === previewUrl}
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
