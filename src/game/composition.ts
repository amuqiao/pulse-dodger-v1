import { STORAGE_KEYS } from './keys';
import type { ScoreProgress, ScoreRepository } from './core/ScoreRepository';
import { platform } from '../platform';

export function assertScorePersistenceAvailable(): void {
  const marker = `ok-${Date.now()}`;
  platform().save(STORAGE_KEYS.storageCheck, marker);
  const saved = platform().load(STORAGE_KEYS.storageCheck);
  if (saved !== marker) {
    throw new Error('Score persistence check failed. Save/load returned inconsistent data.');
  }
}

function validateProgress(value: unknown): ScoreProgress {
  if (!value || typeof value !== 'object') {
    throw new Error('Stored score progress is not an object.');
  }

  const progress = value as Record<string, unknown>;
  const bestScore = progress.bestScore;
  const runsPlayed = progress.runsPlayed;

  if (typeof bestScore !== 'number' || !Number.isSafeInteger(bestScore) || bestScore < 0) {
    throw new Error('Stored score progress has an invalid bestScore.');
  }
  if (typeof runsPlayed !== 'number' || !Number.isSafeInteger(runsPlayed) || runsPlayed < 0) {
    throw new Error('Stored score progress has an invalid runsPlayed.');
  }

  return { bestScore, runsPlayed };
}

class PlatformScoreRepository implements ScoreRepository {
  loadProgress(): ScoreProgress {
    const raw = platform().load(STORAGE_KEYS.progress);
    if (raw === null) return { bestScore: 0, runsPlayed: 0 };
    return validateProgress(JSON.parse(raw));
  }

  saveProgress(progress: ScoreProgress): void {
    platform().save(STORAGE_KEYS.progress, JSON.stringify(progress));
  }
}

export const scores: ScoreRepository = new PlatformScoreRepository();
