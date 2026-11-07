import { createZodDto } from 'nestjs-zod';
import z from 'zod';

export const AssetChapterSchema = z
  .object({
    startTime: z.number().nonnegative().meta({ format: 'double' }).describe('Chapter start time in seconds'),
    endTime: z.number().positive().meta({ format: 'double' }).describe('Chapter end time in seconds'),
    title: z.string().nullable().describe('Embedded chapter title, if present'),
  })
  .refine(({ startTime, endTime }) => endTime > startTime)
  .meta({ id: 'AssetChapterResponseDto' });

export class AssetChapterResponseDto extends createZodDto(AssetChapterSchema) {}
