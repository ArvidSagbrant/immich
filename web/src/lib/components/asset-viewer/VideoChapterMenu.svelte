<script lang="ts">
  import type { AssetChapterResponseDto } from '@immich/sdk';
  import { Icon } from '@immich/ui';
  import { mdiFormatListNumbered } from '@mdi/js';
  import { Duration } from 'luxon';
  import { t } from 'svelte-i18n';

  interface Props {
    chapters: AssetChapterResponseDto[];
    player: Pick<HTMLMediaElement, 'currentTime'> | undefined;
    ready: boolean;
    currentTime: number;
  }

  let { chapters, player, ready, currentTime }: Props = $props();
  let menu: HTMLDetailsElement | undefined = $state();
  const activeIndex = $derived(
    chapters.findLastIndex((chapter) => currentTime >= chapter.startTime && currentTime < chapter.endTime),
  );

  const seek = (startTime: number) => {
    if (player && ready) {
      player.currentTime = startTime;
      if (menu) {
        menu.open = false;
        menu.querySelector('summary')?.focus();
      }
    }
  };

  const timestamp = (seconds: number) =>
    Duration.fromObject({ seconds: Math.floor(seconds) }).toFormat(seconds >= 3600 ? 'h:mm:ss' : 'm:ss');
</script>

{#if chapters.length > 0}
  <details bind:this={menu} class="relative shrink-0">
    <summary
      class="cursor-pointer list-none rounded-full p-2"
      aria-label={$t('video_chapters')}
      title={$t('video_chapters')}
    >
      <Icon icon={mdiFormatListNumbered} />
    </summary>
    <ol
      aria-label={$t('video_chapters')}
      class="absolute right-0 bottom-12 z-10 max-h-64 w-72 max-w-[80vw] overflow-y-auto rounded-xl bg-light-100 p-2 leading-normal text-dark shadow-sm"
    >
      {#each chapters as chapter, index (chapter.startTime)}
        <li>
          <button
            type="button"
            class="flex min-h-10 w-full gap-3 rounded-lg p-2 text-left hover:bg-light-200 focus-visible:bg-light-200 aria-current:bg-light-200"
            disabled={!ready}
            aria-current={index === activeIndex ? 'true' : undefined}
            onclick={() => seek(chapter.startTime)}
          >
            <span class="shrink-0 tabular-nums">{timestamp(chapter.startTime)}</span>
            <span class="min-w-0 wrap-anywhere"
              >{chapter.title || $t('video_chapter', { values: { number: index + 1 } })}</span
            >
          </button>
        </li>
      {/each}
    </ol>
  </details>
{/if}
