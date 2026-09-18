import type { ScoreProgress, ScoreRepository } from '../../src/game/core/ScoreRepository.ts';

export class InMemoryScoreRepository implements ScoreRepository {
  private progress: ScoreProgress = { bestScore: 0, runsPlayed: 0 };

  loadProgress(): ScoreProgress {
    return { ...this.progress };
  }

  saveProgress(progress: ScoreProgress): void {
    this.progress = { ...progress };
  }
}
