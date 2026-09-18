/**
 * 平台适配层接口。
 *
 * 唯一的铁律:游戏核心(scenes / core / systems)只能 import 这个文件,
 * 永远不许直接碰 window.CrazyGames。换平台时只换 adapter,玩法一行不动。
 *
 *   错误: PlayScene -> window.CrazyGames.SDK.ad.requestAd(...)
 *   正确: PlayScene -> platform.showRewarded('revive')
 */

/** 平台能力。不支持的能力要**显式暴露**,让 UI 自己决定藏按钮,而不是假装调用成功。 */
export interface PlatformCapabilities {
  interstitialAds: boolean;
  rewardedAds: boolean;
  banners: boolean;
  cloudSave: boolean;

  // 下面两个不是"能不能",而是"平台是不是已经替你做了"。
  // 这类能力位存在的意义:同一份 UI 代码,在不同平台上自动决定画不画,
  // 而不是靠你每次发行前手动删一遍。

  /** 平台外框自带静音开关。为 true 时游戏内**不该**再做一个,否则两个开关互相打架。 */
  platformProvidesAudioToggle: boolean;
  /** 平台自带加载动画。为 true 时游戏内不该再画一个,否则会闪两次。 */
  platformProvidesLoadingUI: boolean;
}

export interface PlatformSettings {
  muteAudio: boolean;
  disableChat: boolean;
}

export interface PlatformAdapter {
  readonly name: string;
  readonly capabilities: PlatformCapabilities;

  /** 失败就抛。init 失败意味着后续所有平台调用都不可信,不要吞掉。 */
  init(): Promise<void>;

  // ---- 生命周期信号:平台靠这些判断"玩家是不是真的在玩",直接影响推荐权重 ----
  loadingStart(): void;
  loadingStop(): void;
  gameplayStart(): void;
  gameplayStop(): void;
  /** 玩家爽到了(破纪录、通关、大连击)时调用,平台会用它优化广告时机。 */
  happyTime(): void;
  /** 0-100 的进度。休闲游戏可以用"当前分/历史最高分"近似。 */
  reportProgress(percentage: number): void;

  // ---- 广告 ----
  /**
   * 插屏广告。resolve 表示"这一轮广告流程结束,游戏可以恢复了",
   * 不代表"广告一定播了"—— 没有库存也是正常情况,游戏必须照常继续。
   */
  showInterstitial(reason: string): Promise<void>;
  /**
   * 激励视频。**返回值就是发不发奖**:
   *   true  = 玩家看完了,发奖
   *   false = 中途关闭 / 没有库存 / 播放出错,不发奖
   * 这个 boolean 是整个适配层最不能写错的地方。
   */
  showRewarded(reason: string): Promise<boolean>;
  showBanner(containerId: string): Promise<void>;
  clearBanners(): void;

  // ---- 存档 ----
  // 注意是同步的:CrazyGames 的 data 模块 API 形状与 localStorage 一致,也是同步。
  // 强行包成 Promise 只会让调用方多写无意义的 await。
  save(key: string, value: string): void;
  load(key: string): string | null;

  // ---- 平台设置 ----
  /** 播放器外框的静音开关等。不接 muteAudio,CrazyGames QA 会退回。 */
  getSettings(): PlatformSettings;
  onSettingsChange(handler: (settings: PlatformSettings) => void): void;
}
