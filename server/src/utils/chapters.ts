import z from 'zod';
import { AssetChapterResponseDto, AssetChapterSchema } from 'src/dtos/asset-chapters.dto.js';

const timestamp = z
  .union([z.number(), z.string().trim().min(1)])
  .transform(Number)
  .pipe(z.number().nonnegative());
const ProbeChapterSchema = z.object({
  start_time: timestamp,
  end_time: timestamp,
  'TAG:title': z.unknown().optional(),
});

export const extractChapters = (input: unknown, duration: number): AssetChapterResponseDto[] => {
  if (!Array.isArray(input)) {
    return [];
  }

  const chapters: AssetChapterResponseDto[] = [];
  for (const item of input) {
    const result = ProbeChapterSchema.safeParse(item);
    if (!result.success) {
      continue;
    }

    const { start_time: startTime, end_time: endTime, 'TAG:title': rawTitle } = result.data;
    const title =
      typeof rawTitle === 'string'
        ? rawTitle
            .replaceAll(
              /\\([\\nrtbf])/g,
              (_, char: string) => ({ n: '\n', r: '\r', t: '\t', b: '\b', f: '\f' })[char] ?? char,
            )
            .trim()
        : '';
    const chapter = AssetChapterSchema.safeParse({
      startTime,
      endTime: Number.isFinite(duration) && duration > 0 ? Math.min(endTime, duration) : endTime,
      title: title || null,
    });
    if (chapter.success) {
      chapters.push(chapter.data);
    }
  }

  return chapters
    .sort((a, b) => a.startTime - b.startTime)
    .filter((chapter, index, sorted) => index === 0 || chapter.startTime !== sorted[index - 1].startTime);
};
