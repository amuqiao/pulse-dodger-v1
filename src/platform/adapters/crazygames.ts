import type { CrazyGamesSDK } from '../crazygames.d';
import type { AdBreakHooks, PlatformAdapter, PlatformCapabilities, PlatformSettings } from '../PlatformAdapter';

const adsEnabled = import.meta.env.VITE_ENABLE_CRAZYGAMES_ADS === 'true';
const supportedEnvironments = new Set(['local', 'crazygames']);

export class CrazyGamesAdapter implements PlatformAdapter {
  readonly name = 'crazygames';

  readonly capabilities: PlatformCapabilities = {
    interstitialAds: adsEnabled,
    rewardedAds: adsEnabled,
    banners: adsEnabled,
    cloudSave: true,
    platformProvidesAudioToggle: true,
    platformProvidesLoadingUI: true,
  };

  private readonly sdk: CrazyGamesSDK;

  constructor(sdk: CrazyGamesSDK) {
    this.sdk = sdk;
  }

  async init(): Promise<void> {
    await this.sdk.init();
    if (!supportedEnvironments.has(this.sdk.environment)) {
      throw new Error(
        `CrazyGames SDK environment is "${this.sdk.environment}". Run on localhost/127.0.0.1, add ?useLocalSdk=true for LAN testing, or use CrazyGames Preview.`,
      );
    }
    console.info(`[platform] CrazyGames SDK initialized: ${this.sdk.environment}`);
  }

  loadingStart(): void {
    this.sdk.game.loadingStart();
  }

  loadingStop(): void {
    this.sdk.game.loadingStop();
  }

  gameplayStart(): void {
    this.sdk.game.gameplayStart();
  }

  gameplayStop(): void {
    this.sdk.game.gameplayStop();
  }

  happyTime(): void {
    this.sdk.game.happytime();
  }

  reportProgress(percentage: number): void {
    this.sdk.game.reportGameCompletedPercentage(Math.max(0, Math.min(100, Math.round(percentage))));
  }

  async showInterstitial(reason: string, hooks: AdBreakHooks): Promise<void> {
    if (!this.capabilities.interstitialAds) {
      console.info(`[ad] Basic Launch mode: interstitial disabled: ${reason}`);
      hooks.onFinished();
      return;
    }

    await new Promise<void>((resolve) => {
      this.sdk.ad.requestAd('midgame', {
        adStarted: () => hooks.onStarted(),
        adFinished: () => {
          hooks.onFinished();
          resolve();
        },
        adError: (error, errorData) => {
          console.warn('[ad] interstitial failed', error, errorData);
          hooks.onFinished();
          resolve();
        },
      });
    });
  }

  async showRewarded(reason: string, hooks: AdBreakHooks): Promise<boolean> {
    if (!this.capabilities.rewardedAds) {
      console.info(`[ad] Basic Launch mode: rewarded disabled: ${reason}`);
      hooks.onFinished();
      return false;
    }

    return await new Promise<boolean>((resolve) => {
      this.sdk.ad.requestAd('rewarded', {
        adStarted: () => hooks.onStarted(),
        adFinished: () => {
          hooks.onFinished();
          resolve(true);
        },
        adError: (error, errorData) => {
          console.warn('[ad] rewarded failed', error, errorData);
          hooks.onFinished();
          resolve(false);
        },
      });
    });
  }

  async showBanner(containerId: string): Promise<void> {
    if (!this.capabilities.banners) {
      console.info('[ad] Basic Launch mode: banner disabled');
      return;
    }
    await this.sdk.banner.requestBanner({ id: containerId });
  }

  clearBanners(): void {
    this.sdk.banner.clearAllBanners();
  }

  save(key: string, value: string): void {
    this.sdk.data.setItem(key, value);
  }

  load(key: string): string | null {
    return this.sdk.data.getItem(key);
  }

  getSettings(): PlatformSettings {
    const { muteAudio, disableChat } = this.sdk.game.settings;
    return { muteAudio, disableChat };
  }

  onSettingsChange(handler: (settings: PlatformSettings) => void): void {
    this.sdk.game.addSettingsChangeListener((settings) => {
      handler({ muteAudio: settings.muteAudio, disableChat: settings.disableChat });
    });
  }
}
