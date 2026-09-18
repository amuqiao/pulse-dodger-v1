export interface ResultData {
  score: number;
  bestScore: number;
  previousBest: number;
  isNewBest: boolean;
  runsPlayed: number;
  survivedMs: number;
  progress: number;
  progressSaved: boolean;
  saveErrorMessage?: string;
}
