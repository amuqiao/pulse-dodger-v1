export interface ScoreProgress {
  bestScore: number;
  runsPlayed: number;
}

export interface ScoreRepository {
  loadProgress(): ScoreProgress;
  saveProgress(progress: ScoreProgress): void;
}
