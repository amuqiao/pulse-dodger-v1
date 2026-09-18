import type { AdBreakHooks, PlatformAdapter, PlatformCapabilities, PlatformSettings } from '../PlatformAdapter';

export class WebAdapter implements PlatformAdapter {
  readonly name = 'web';

  readonly capabilities: PlatformCapabilities = {
    interstitialAds: false,
    rewardedAds: false,
    banners: false,
    cloudSave: false,
    platformProvidesAudioToggle: false,
    platformProvidesLoadingUI: false,
  };

  private settings: PlatformSettings = { muteAudio: false, disableChat: false };

  async init(): Promise<void> {
    console.info('[platform] WebAdapter initialized');
  }

  loadingStart(): void {}
  loadingStop(): void {}
  gameplayStart(): void {}
  gameplayStop(): void {}
  happyTime(): void {}
  reportProgress(_percentage: number): void {}

  async showInterstitial(reason: string, hooks: AdBreakHooks): Promise<void> {
    console.info(`[ad] no local interstitial: ${reason}`);
    hooks.onFinished();
  }

  async showRewarded(reason: string, hooks: AdBreakHooks): Promise<boolean> {
    console.info(`[ad] no local rewarded ad: ${reason}`);
    hooks.onFinished();
    return false;
  }

  async showBanner(_containerId: string): Promise<void> {}
  clearBanners(): void {}

  save(key: string, value: string): void {
    window.localStorage.setItem(key, value);
  }

  load(key: string): string | null {
    return window.localStorage.getItem(key);
  }

  getSettings(): PlatformSettings {
    return this.settings;
  }

  onSettingsChange(_handler: (settings: PlatformSettings) => void): void {}
}

