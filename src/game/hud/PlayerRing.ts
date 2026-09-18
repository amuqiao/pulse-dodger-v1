import Phaser from 'phaser';
import { PLAYER, PULSE } from '../tuning';
import { THEME } from '../theme';

/** 60Hz 下一帧的毫秒数,用作帧率补偿的基准(同 PlayerController 的写法)。 */
const FRAME_MS_60 = 1000 / 60;

/**
 * 玩家身上的充能环 + 冲击波范围预览。
 *
 * 为什么状态要画在玩家身上而不是屏幕角落:躲避游戏玩家的视线 100% 锁在
 * 屏幕中心的自己身上,把"还差多少充能""放出去能炸到多大范围""瞄准的
 * 目标够不够密"这三件事都摆在玩家视线本来就在的地方,才算真的被看到。
 *
 * 只画,不碰任何玩法状态 —— chargeRatio / pulseReady / inRangeCount 全部
 * 由调用方(PlayScene)算好传进来。
 */
export class PlayerRing {
  private readonly graphics: Phaser.GameObjects.Graphics;

  /**
   * 充能弧的阻尼跟随值。不直接画 chargeRatio,而是让显示值追着目标跑 ——
   * 吃到一颗能量点的瞬间弧长会明显落后于目标,再用几帧追上去,这个
   * "追赶感"就是充能反馈的一半,直接画 chargeRatio 会显得又硬又平。
   */
  private displayRatio = 0;

  /** 满充能瞬间的一次性扩张动画:数值代理,onUpdate 里回写,Graphics 只读它。 */
  private readonly burstProxy = { radius: 0 };
  private burstActive = false;

  constructor(private readonly scene: Phaser.Scene) {
    // depth 介于玩法实体(默认 0)和 HUD(100)之间:环要盖住碎片/能量点的
    // 视觉噪音,但不能压过 HUD 数字和暂停按钮。
    this.graphics = scene.add.graphics().setDepth(40);
  }

  update(
    x: number,
    y: number,
    chargeRatio: number,
    pulseReady: boolean,
    inRangeCount: number,
    delta: number,
    now: number,
  ): void {
    const damping = THEME.pulsePreview.damping;
    const target = Phaser.Math.Clamp(chargeRatio, 0, 1);
    // 帧率补偿:把"每 16.667ms 靠拢 damping 比例"换算成任意 delta 下等效的
    // 靠拢比例,144Hz/165Hz 显示器上手感和 60Hz 一致(同 PlayerController)。
    const t = 1 - Math.pow(1 - damping, delta / FRAME_MS_60);
    this.displayRatio += (target - this.displayRatio) * t;

    this.graphics.clear();

    if (this.burstActive) {
      this.drawBurstRing(x, y);
    } else if (pulseReady) {
      this.drawReadyPreview(x, y, inRangeCount, now);
    } else {
      this.drawChargeArc(x, y);
    }
  }

  /**
   * 刚充满的那一刻播一次:环从充能弧的半径一次性扩张到 PULSE.radius
   * (Back.Out 的过冲曲线自己就带出"冲过头再定住"的手感),动画结束后
   * 交回给 update() 里的常驻预览态(半径收敛到 restRatio × PULSE.radius)。
   * 一次动画讲清一个机制:玩家会看到"我的攻击范围就是这么大"。
   */
  playReadyBurst(x: number, y: number): void {
    const p = THEME.pulsePreview;

    this.scene.tweens.killTweensOf(this.burstProxy);
    this.burstProxy.radius = PLAYER.radius + p.chargeRingGap;
    this.burstActive = true;

    this.scene.tweens.add({
      targets: this.burstProxy,
      radius: PULSE.radius,
      duration: p.readyExpandMs,
      ease: 'Back.Out',
      onComplete: () => {
        this.burstActive = false;
      },
    });

    // 立即画一帧起始状态,避免触发和下一次 scene update() 之间露出空白帧。
    this.graphics.clear();
    this.drawBurstRing(x, y);
  }

  /** 未满充能:充能弧 + 底下的整圈轨道。 */
  private drawChargeArc(x: number, y: number): void {
    const p = THEME.pulsePreview;
    const radius = PLAYER.radius + p.chargeRingGap;

    this.graphics.lineStyle(p.chargeRingWidth, THEME.chargeBar.trackFill, p.trackAlpha);
    this.graphics.strokeCircle(x, y, radius);

    if (this.displayRatio <= 0) {
      return;
    }

    const startRad = Phaser.Math.DegToRad(-90);
    const endRad = startRad + Phaser.Math.DegToRad(this.displayRatio * 360);

    this.graphics.lineStyle(p.chargeRingWidth, THEME.entity.mote, 1);
    this.graphics.beginPath();
    this.graphics.arc(x, y, radius, startRad, endRad, false);
    this.graphics.strokePath();
  }

  /**
   * 满充能常驻预览圈:呼吸用绝对时间驱动,`inRangeCount` 达到
   * happyTime 阈值时变金色 —— 玩家会自己学会"等圈里变金再放"。
   */
  private drawReadyPreview(x: number, y: number, inRangeCount: number, now: number): void {
    const p = THEME.pulsePreview;
    const happy = inRangeCount >= PULSE.happyTimeThreshold;

    const breath = 1 + Math.sin(now / p.breathMs) * p.breathAmount;
    const radius = PULSE.radius * p.restRatio * breath;

    this.graphics.lineStyle(
      happy ? p.ringWidthHappy : p.ringWidth,
      happy ? THEME.entity.pulse : THEME.entity.mote,
      happy ? p.ringAlphaHappy : p.ringAlpha,
    );
    this.graphics.strokeCircle(x, y, radius);
  }

  private drawBurstRing(x: number, y: number): void {
    this.graphics.lineStyle(THEME.pulsePreview.chargeRingWidth, THEME.entity.pulse, 1);
    this.graphics.strokeCircle(x, y, this.burstProxy.radius);
  }
}
