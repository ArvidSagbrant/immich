<script lang="ts">
  import type { AssetChapterResponseDto } from '@immich/sdk';
  import './immich-time-range';

  let { chapters, duration }: { chapters: AssetChapterResponseDto[]; duration: number } = $props();
</script>

<div class="relative h-8 w-full px-2 pb-3">
  <immich-time-range class="size-full rounded-lg outline-none"></immich-time-range>
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
