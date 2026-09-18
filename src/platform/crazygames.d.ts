export interface CrazyGamesSettings {
  muteAudio: boolean;
  disableChat: boolean;
}

export interface CrazyGamesSDK {
  init(): Promise<void>;
  environment: 'local' | 'crazygames' | 'disabled' | string;
  game: {
    settings: CrazyGamesSettings;
    loadingStart(): void;
    loadingStop(): void;
    gameplayStart(): void;
    gameplayStop(): void;
    happytime(): void;
    reportGameCompletedPercentage(percentage: number): void;
    addSettingsChangeListener(handler: (settings: CrazyGamesSettings) => void): void;
  };
  ad: {
    requestAd(
      type: 'midgame' | 'rewarded',
      callbacks: {
        adStarted(): void;
        adFinished(): void;
        adError(error: unknown, errorData?: unknown): void;
      },
    ): void;
  };
  banner: {
    requestBanner(options: { id: string; width?: number; height?: number }): Promise<void>;
    clearBanner(id: string): void;
    clearAllBanners(): void;
  };
  data: {
    setItem(key: string, value: string): void;
    getItem(key: string): string | null;
  };
}

declare global {
  interface Window {
    CrazyGames?: {
      SDK?: CrazyGamesSDK;
    };
  }
}

export {};

