import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, u } from '../viewport';
import { BANNER_CONTAINER_ID } from '../keys';
import { THEME } from '../theme';
import { shouldShowInterstitial } from '../core/adCadence.ts';
import { platform } from '../../platform';
import { audio } from '../effects/audio';
import { Button } from '../ui/Button';
import { SCENES, type ResultData } from './contracts';
import { fadeInScene, fadeToScene } from './transition';

/** 分数滚动时长(毫秒)。全游戏最便宜的一次多巴胺,别省。 */
const SCORE_COUNT_MS = 600;
/** 滚分期间的计数音间隔(毫秒),和 SCORE_COUNT_MS 一起决定总共响几声 */
const COUNT_TICK_INTERVAL_MS = 60;
/** 破纪录进度条填充时长(毫秒),和滚分同步开始,时长故意略长一点,让填充"追上"滚动的数字。 */
const BAR_FILL_MS = 700;
/** isNewBest 时,填满后越过标记线继续冲出去多远 */
const OVERSHOOT_PX = u(20);
/** score < best 且差距在这个比例以内才显示"差 N 分破纪录"的压力文案 */
const NEAR_BEST_RATIO = 0.15;

export class ResultScene extends Phaser.Scene {
  private result!: ResultData;

  constructor() {
    super(SCENES.Result);
  }

  init(data: ResultData): void {
    this.result = data;
  }

  create(): void {
    fadeInScene(this);
    this.cameras.main.setBackgroundColor(THEME.bg);

    if (this.result.isNewBest) {
      audio.newBest();
    }

    const cx = GAME_WIDTH / 2;
    const y = (ratio: number): number => GAME_HEIGHT * ratio;

    this.add
      .text(cx, y(THEME.anchor.heading), this.result.isNewBest ? THEME.copy.newBest : THEME.copy.gameOver, {
        fontSize: THEME.font.heading,
        color: this.result.isNewBest ? THEME.text.warning : THEME.text.primary,
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    this.createScoreCountUp(cx, y(THEME.anchor.lead));
    this.createSurvivedLine(cx, y(THEME.anchor.meta));
    this.createRecordBar(cx, y(THEME.anchor.meta) + THEME.space.lg);
    this.createActionButtons(cx, y);

    this.add
      .text(cx, y(THEME.anchor.footer), THEME.copy.resultTip, {
        fontSize: THEME.font.small,
        color: THEME.text.dim,
      })
      .setOrigin(0.5);

    if (platform().capabilities.banners) {
      void platform().showBanner(BANNER_CONTAINER_ID);
    }
  }

  /** 分数从 0 滚到最终值,600ms Cubic.Out —— 全游戏最便宜的一次多巴胺。 */
  private createScoreCountUp(cx: number, scoreY: number): void {
    const scoreText = this.add
      .text(cx, scoreY, '0', { fontSize: THEME.font.score, color: THEME.text.accent, fontStyle: 'bold' })
      .setOrigin(0.5);

    const proxy = { value: 0 };
    this.tweens.add({
      targets: proxy,
      value: this.result.score,
      duration: SCORE_COUNT_MS,
      ease: 'Cubic.Out',
      onUpdate: () => scoreText.setText(String(Math.floor(proxy.value))),
    });

    // 滚分期间每 60ms 一声计数音,和滚分同时开始、同时结束(见
    // COUNT_TICK_INTERVAL_MS 的取值:SCORE_COUNT_MS / 60ms = 10 声)。
    this.time.addEvent({
      delay: COUNT_TICK_INTERVAL_MS,
      repeat: Math.round(SCORE_COUNT_MS / COUNT_TICK_INTERVAL_MS) - 1,
      callback: () => audio.countTick(),
    });
  }

  private createSurvivedLine(cx: number, metaY: number): void {
    this.add
      .text(cx, metaY, THEME.copy.survivedFor(this.result.survivedSeconds, this.result.best), {
        fontSize: THEME.font.body,
        color: THEME.text.dim,
      })
      .setOrigin(0.5);
  }

  /**
   * 破纪录进度条 —— 核心留存钩子。
   *
   * 关于 `previousBest` 这个字段为什么必须存在:
   * `isNewBest` 为真时,`best` 已经是"结算后写回存档的新值",和 `score` 相等 ——
   * 光靠 `best` 和 `score` **算不出"超出纪录多少分"**。
   * 所以 `GameState.finish()` 在覆盖存档**之前**先把旧值捞出来,透传到这里。
   *
   * 这类"写回时把原值冲掉"的信息丢失很隐蔽:它不会崩溃,只会让某句文案
   * 永远显示不出来,而且没人知道为什么。tests/gameState.test.ts 里有两条
   * 测试专门锁住这个行为。
   */
  private createRecordBar(cx: number, barY: number): void {
    const { score, best, isNewBest, previousBest } = this.result;
    const width = u(520);
    const height = u(10);
    const radius = height / 2;
    const trackX = cx - width / 2;

    // 避免除以 0:两个都还是 0(理论上不该发生,存活 0 秒且 0 分)时直接不画进度、不画标记
    const denom = Math.max(best, score);
    const ratio = denom > 0 ? Phaser.Math.Clamp(score / denom, 0, 1) : 0;
    const markerRatio = best > 0 && denom > 0 ? Phaser.Math.Clamp(best / denom, 0, 1) : null;

    const track = this.add.graphics();
    track.fillStyle(THEME.chargeBar.trackFill, 1);
    track.fillRoundedRect(trackX, barY, width, height, radius);

    const fill = this.add.graphics();
    const fillProxy = { width: 0 };
    const targetFillWidth = isNewBest ? width + OVERSHOOT_PX : width * ratio;

    this.tweens.add({
      targets: fillProxy,
      width: targetFillWidth,
      duration: BAR_FILL_MS,
      ease: 'Cubic.Out',
      onUpdate: () => {
        fill.clear();
        if (fillProxy.width <= 0) {
          return;
        }
        fill.fillStyle(isNewBest ? THEME.entity.pulse : THEME.entity.mote, 1);
        fill.fillRoundedRect(trackX, barY, Math.min(fillProxy.width, width + OVERSHOOT_PX), height, radius);
      },
    });

    if (markerRatio !== null) {
      const markerX = trackX + width * markerRatio;
      const marker = this.add.graphics();
      // 标记线:未破纪录时是中性色(复用 text.primary 对应的色值),isNewBest 时变金(entity.pulse)
      marker.fillStyle(isNewBest ? THEME.entity.pulse : THEME.entity.player, 1);
      marker.fillRect(markerX - u(3) / 2, barY - u(3), u(3), height + u(6));
    }

    this.createRecordBarCaption(cx, barY + height + THEME.space.md, score, best, isNewBest, denom, previousBest);
  }

  private createRecordBarCaption(
    cx: number,
    captionY: number,
    score: number,
    best: number,
    isNewBest: boolean,
    denom: number,
    previousBest: number,
  ): void {
    if (isNewBest) {
      // 破了纪录:能算出超出多少就报数字,首次破纪录(旧纪录为 0)就只庆祝
      const over = score - previousBest;
      const caption = previousBest > 0 ? THEME.copy.overBest(over) : THEME.copy.recordBroken;
      this.popCaption(cx, captionY, caption, THEME.text.warning);
      return;
    }

    const gap = best - score;
    const gapRatio = denom > 0 ? gap / denom : 0;
    if (gap > 0 && gapRatio <= NEAR_BEST_RATIO) {
      this.popCaption(cx, captionY, THEME.copy.gapToBest(gap), THEME.text.warning);
    }
    // 差距大:什么都不加,只留一条安静的进度条,不给玩家不必要的压力
  }

  private popCaption(cx: number, textY: number, label: string, color: string): void {
    const caption = this.add
      .text(cx, textY, label, { fontSize: THEME.font.small, color, fontStyle: 'bold' })
      .setOrigin(0.5)
      .setScale(0);

    this.tweens.add({
      targets: caption,
      scale: 1,
      duration: 260,
      delay: BAR_FILL_MS - 160,
      ease: 'Back.Out',
    });
  }

  private createActionButtons(cx: number, y: (ratio: number) => number): void {
    new Button(
      this,
      cx,
      y(THEME.anchor.action),
      THEME.copy.playAgain,
      () => void this.restart(),
      { variant: 'primary', fontSize: THEME.font.button },
    );

    // 现在玩家被困在 Result ↔ Play 里,想改设置只能刷页面 —— 补一个回主页的出口
    new Button(
      this,
      cx,
      y(THEME.anchor.subAction),
      THEME.copy.quitToMenu,
      () => {
        platform().clearBanners();
        fadeToScene(this, SCENES.Menu);
      },
      { variant: 'ghost', fontSize: THEME.font.small, paddingX: THEME.space.md, paddingY: THEME.space.xs },
    );
  }

  /**
   * 插屏广告的节奏:第 1 局不打,之后每 3 局打一次。
   * 新玩家第一局就吃广告是最伤留存的做法,别这么干。
   */
  private async restart(): Promise<void> {
    const shouldShowAd = shouldShowInterstitial(this.result.runsPlayed);

    platform().clearBanners();

    if (shouldShowAd && platform().capabilities.interstitialAds) {
      // 契约:调广告之前自己停音频,await 返回后再恢复
      // 广告期间必须【暂停 + 静音】。只静音的话,插屏播放期间结算页的
      // 滚分和进度条 tween 还在跑,广告结束回来动画已经演完了 ——
      // 玩家等了十几秒,回来什么都没看到。
      audio.setAdMuted(true);
      this.scene.pause();
      try {
        await platform().showInterstitial('restart');
      } finally {
        this.scene.resume();
        audio.setAdMuted(false);
      }
    }

    fadeToScene(this, SCENES.Play);
  }
}
