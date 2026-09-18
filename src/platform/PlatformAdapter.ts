export interface PlatformCapabilities {
  interstitialAds: boolean;
  rewardedAds: boolean;
  banners: boolean;
  cloudSave: boolean;
  platformProvidesAudioToggle: boolean;
  platformProvidesLoadingUI: boolean;
}

export interface PlatformSettings {
  muteAudio: boolean;
  disableChat: boolean;
}

export interface AdBreakHooks {
  onStarted(): void;
  onFinished(): void;
}

export interface PlatformAdapter {
  readonly name: string;
  readonly capabilities: PlatformCapabilities;

  init(): Promise<void>;

  loadingStart(): void;
  loadingStop(): void;
  gameplayStart(): void;
  gameplayStop(): void;
  happyTime(): void;
  reportProgress(percentage: number): void;

  showInterstitial(reason: string, hooks: AdBreakHooks): Promise<void>;
  showRewarded(reason: string, hooks: AdBreakHooks): Promise<boolean>;
  showBanner(containerId: string): Promise<void>;
  clearBanners(): void;

  save(key: string, value: string): void;
  load(key: string): string | null;

  getSettings(): PlatformSettings;
  onSettingsChange(handler: (settings: PlatformSettings) => void): void;
}

