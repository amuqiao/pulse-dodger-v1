import type { PlatformAdapter, PlatformCapabilities, PlatformSettings } from '../PlatformAdapter';

/**
 * 本地/自托管环境的适配器。
 *
 * 这**不是**"CrazyGames 调用失败时的兜底" —— 它是一个平等的目标平台实现,
 * 用于 npm run dev、itch.io、GitHub Pages 这类没有 CrazyGames SDK 的环境。
 * 选哪个 adapter 在启动时一次性决定(见 ../index.ts),之后不会互相回退。
 */
export class WebAdapter implements PlatformAdapter {
  readonly name = 'web';

  readonly capabilities: PlatformCapabilities = {
    interstitialAds: false,
    rewardedAds: false,
    banners: false,
    cloudSave: false,
    // 自托管环境没有播放器外框,静音和加载 UI 都得游戏自己来
    platformProvidesAudioToggle: false,
    platformProvidesLoadingUI: false,
  };

  private settings: PlatformSettings = { muteAudio: false, disableChat: false };

  async init(): Promise<void> {
    console.info('[platform] WebAdapter 已启用(无广告、无云存档,存档走 localStorage)');
  }

  loadingStart(): void {}
  loadingStop(): void {}
  gameplayStart(): void {}
  gameplayStop(): void {}
  happyTime(): void {}
  reportProgress(_percentage: number): void {}

  async showInterstitial(reason: string): Promise<void> {
    console.info(`[platform] 本地环境无插屏广告,跳过: ${reason}`);
  }

  /** 本地环境没有广告可播,所以没有"看完"这件事,一律不发奖。 */
  async showRewarded(reason: string): Promise<boolean> {
    console.info(`[platform] 本地环境无激励视频,不发奖: ${reason}`);
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

  onSettingsChange(_handler: (settings: PlatformSettings) => void): void {
    // 本地环境没有平台外框,设置永远不会变化,不需要注册监听。
  }
}
