export function getVideoPreviewSheetLayout(duration: number | null) {
  if (!duration || duration <= 0) {
    return;
  }
  const seconds = duration / 1000;
  const interval = Math.max(1, Math.ceil(seconds / 120));
  return { width: 160, height: 90, columns: 8, interval, count: Math.ceil(seconds / interval) };
}

export type VideoPreviewSheetLayout = NonNullable<ReturnType<typeof getVideoPreviewSheetLayout>>;
