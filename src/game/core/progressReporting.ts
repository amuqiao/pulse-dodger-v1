const clampProgress = (progress: number): number => Math.max(0, Math.min(1, progress));

export function completionReportPercent(progress: number): number | null {
  return clampProgress(progress) >= 1 ? 100 : null;
}
