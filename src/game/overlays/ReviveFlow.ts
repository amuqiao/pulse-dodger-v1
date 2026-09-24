import Phaser from 'phaser';
import { THEME } from '../theme';
import { Panel } from '../ui/Panel';
import { platform } from '../../platform';

/** 复活询问的倒计时秒数 */
const REVIVE_PROMPT_SECONDS = 5;

/**
 * ReviveFlow 需要的外部依赖,由调用方(PlayScene)注入。
 *
 * 不直接在这里 import effects/audio,理由和 PauseController 一样:
 * `overlays/` 是"下一款游戏整个目录照抄"的外壳代码,不认任何具体音频
 * 实现,静音是每款游戏各自的音频实现细节,ReviveFlow 只认"能不能把广告
 * 期间的静音设上/撤下"这个动作,不认背后是哪套音频系统。
 */
export interface ReviveFlowHooks {
  /**
   * 广告播放期间必须静音,CrazyGames 官方要求。`true` = 广告开始前设,
   * `false` = 广告结束(无论成功与否)后立刻撤。封装在这一个方法里之后,
   * 调用方(handleDeath)不可能再漏掉某一侧。
   */
  setAdMuted(muted: boolean): void;
}

/**
 * 死亡后的"看广告复活"编排。
 *
 * 整段"照抄"的外壳代码 —— 能力检测 / 倒计时 Panel / 激励视频播放 /
 * 广告期间静音,这四件事每款游戏都要重新踩一遍坑,抽到这里后只需要
 * 照抄整个 overlays/ 目录。
 *
 * **配额判断不在这里**:"每局只能复活一次"是 GameState.canRevive /
 * consumeRevive() 的职责。ReviveFlow 只负责"问 + 放广告",调用方在
 * 调 offer() 之前自己先查 canRevive。
 */
export class ReviveFlow {
  constructor(
    private readonly scene: Phaser.Scene,
    private readonly hooks: ReviveFlowHooks,
  ) {}

  /**
   * true = 广告看完了,应该复活。能力不支持 / 玩家放弃 / 广告没看完 一律 false。
   */
  async offer(): Promise<boolean> {
    if (!platform().capabilities.rewardedAds) {
      return false;
    }

    const accepted = await this.askRevive();
    if (!accepted) {
      return false;
    }

    // ── 广告期间必须【暂停 + 静音】,两件事缺一不可 ──
    //
    // 平台适配层的文件头写着契约:"调用方在调广告之前必须自己暂停游戏并停音频"。
    // 曾经这里只做了静音那一半,后果是:激励视频播放的十几秒里,物理世界、
    // tween、相机全在跑 —— 碎片继续飞满屏,而此时出屏回收也不跑,它们只会
    // 越积越多;复活回来时错峰清场会对着一堆早就飞出视野的碎片放几十声琶音。
    //
    // 用 scene.pause() 而不是 physics.pause() + tweens.pauseAll():
    // 后者是共享布尔开关,会和 PauseController / feel 抢状态(见 feel.hitstop
    // 的注释)。scene.pause() 停的是整个场景的 update 循环,语义更干净,
    // 而且这里的 await 不依赖该场景的 update(Panel 早已 resolve 完了)。
    this.hooks.setAdMuted(true);
    this.scene.scene.pause();
    try {
      const rewarded = await platform().showRewarded('revive');
      // 只有真的看完广告才复活。adError / 中途关闭一律不发奖。
      return rewarded;
    } finally {
      // 无论 adFinished 还是 adError,广告流程一结束就必须成对撤销,
      // 用 finally 而不是分别在成功/失败分支里各写一遍。
      this.scene.scene.resume();
      this.hooks.setAdMuted(false);
    }
  }

  /**
   * 复活询问。用共用的 Panel,不再手搓一套 —— 手搓的那版既没走 theme.copy
   * (以后做多语言会漏翻译),也没走 Panel(换皮时不会跟着变)。
   *
   * 5 秒倒计时:点了 REVIVE 算接受,点 NO THANKS 或超时算放弃。
   * 审核纯净版没有广告能力时 offer() 会直接返回 false;正式版有激励视频时,
   * 拒绝入口必须即时可见,不能强迫玩家等倒计时。
   */
  private askRevive(): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      let remaining = REVIVE_PROMPT_SECONDS;

      const panel = new Panel(this.scene, {
        title: THEME.copy.reviveTitle,
        subtitle: THEME.copy.reviveCountdown(remaining),
        buttons: [
          {
            label: THEME.copy.reviveButton,
            style: 'warning',
            onClick: () => {
              timer.remove();
              panel.destroy();
              resolve(true);
            },
          },
          {
            label: THEME.copy.noThanks,
            style: 'ghost',
            onClick: () => {
              timer.remove();
              panel.destroy();
              resolve(false);
            },
          },
        ],
      });

      const timer = this.scene.time.addEvent({
        delay: 1000,
        repeat: REVIVE_PROMPT_SECONDS - 1,
        callback: () => {
          remaining -= 1;
          panel.setSubtitle(THEME.copy.reviveCountdown(remaining));
          if (remaining <= 0) {
            panel.destroy();
            resolve(false);
          }
        },
      });
    });
  }
}
