import Phaser from 'phaser';
import { u } from '../viewport';
import { FX } from '../tuning';
import { THEME } from '../theme';

/** 冲击波光环的起始半径/描边宽度(设计单位),纯本文件内部实现细节 */
const RING_START_RADIUS = u(5);
const RING_STROKE_WIDTH = u(2);

/**
 * 特效系统:冲击波光环 / 粒子迸溅 / 飘字。
 *
 * system 不许 import GameState —— system 只接受入参、返回结果,把结果写回
 * GameState 是 PlayScene 的事。
 *
 * 对象池化是这个文件存在的主要理由(本项目收益最大的一处性能修复):
 *   ① floatText 原来每次 `add.text()` 都会新建一个 HTMLCanvas、跑一次
 *      measureText、再上传一张 WebGL 纹理 —— 是本项目单次开销最大的操作,
 *      现在改成 `FX.floatTextPoolSize` 个常驻 Text 轮转复用。
 *   ② burst 原来每次都 `add.particles()` 新建一个 emitter,冲击波清 8 个
 *      就是一帧内 8 个新 GameObject + 8 次纹理批次切换,现在改成每种实体颜色各一个常驻
 *      emitter(mote 色 / hazard 色 / pulse 色),用 emitParticleAt 复用,
 *      emitter 本身再也不会被 destroy。
 *   ③ 粒子数量有同屏硬上限(`FX.particleCap`)和单次 burst 上限
 *      (`FX.burstUnitCap * FX.particlesPerUnit`),见 burst() 内的注释。
 */
export class Fx {
  private readonly texts: Phaser.GameObjects.Text[];
  private textCursor = 0;

  private readonly emitters: Map<number, Phaser.GameObjects.Particles.ParticleEmitter>;

  constructor(private readonly scene: Phaser.Scene) {
    this.texts = Array.from({ length: FX.floatTextPoolSize }, () =>
      scene.add
        .text(0, 0, '', { fontSize: THEME.font.button, fontStyle: 'bold' })
        .setOrigin(0.5)
        .setDepth(120)
        .setVisible(false),
    );

    // 只覆盖 THEME.entity 里当前会传给 burst() 的 3 种颜色,见 emitterFor()
    // 里"取不到就抛"的说明。
    this.emitters = new Map([
      [THEME.entity.mote, this.createEmitter(THEME.entity.mote)],
      [THEME.entity.hazard, this.createEmitter(THEME.entity.hazard)],
      [THEME.entity.pulse, this.createEmitter(THEME.entity.pulse)],
      // 玩家色:死亡爆炸用。以前 PlayScene 每次死亡现建一个临时 emitter,
      // 既违反本文件"零运行时分配"的承诺,那部分粒子还**绕过了 particleCap**。
      [THEME.entity.player, this.createEmitter(THEME.entity.player)],
    ]);
  }

  /**
   * 冲击波光环。radius 由调用方传入(比如 `PULSE.radius`),这里不假设
   * 具体数值 —— 换一款玩法冲击波半径变了,这个函数不需要跟着改。
   */
  shockwave(x: number, y: number, radius: number): void {
    const ring = this.scene.add.circle(x, y, RING_START_RADIUS).setDepth(50);
    ring.setStrokeStyle(RING_STROKE_WIDTH, THEME.entity.pulse, 1);
    this.scene.tweens.add({
      targets: ring,
      radius,
      alpha: 0,
      duration: 380,
      ease: 'Cubic.Out',
      // Arc.radius 是带 updateData() 的 setter,tween 可以直接驱动,无需 onUpdate 回写
      onComplete: () => ring.destroy(),
    });
  }

  /**
   * 一次性大爆炸(死亡用)。和 burst 的区别:直接给粒子数,不走"强度单位"换算,
   * 但**仍然受 particleCap 约束** —— 这正是它存在的意义:让死亡粒子也进全局预算,
   * 而不是绕过去。
   */
  explode(x: number, y: number, color: number, particles: number): void {
    const emitter = this.emitterFor(color);
    const budget = Math.max(0, FX.particleCap - this.aliveParticleCount());
    const n = Math.min(particles, budget);
    if (n > 0) {
      emitter.emitParticleAt(x, y, n);
    }
  }

  /**
   * 迸溅粒子。`count` 不是字面粒子数,是"强度单位"(0 ~ `FX.burstUnitCap`),
   * 内部换算成 `min(count, FX.burstUnitCap) * FX.particlesPerUnit` 颗实际
   * 粒子 —— 单次最多 48 颗封顶。这是刻意的二次截断:冲击波一次可能清掉
   * 十几个 hazard,每清一个都会调一次 burst(见 PlayScene.onPulse),如果
   * 不做这层截断,清 12 个时若直接按"字面粒子数"处理会变成 12 × 期望密度
   * 这种量级(比如误当成 72 颗),叠加下面的同屏硬上限很容易一次性把预算
   * 挤爆、后续的 shockwave / floatText 反而看不到效果。
   * 默认值 2 对应"1 个物体死亡"的视觉密度(2 × 6 = 12 颗,和池化前的默认
   * 12 颗一致);玩家死亡这类更大的视觉事件不走 burst,走下面的 explode() ——
   * 它直接给粒子数,但同样受 particleCap 约束。
   */
  burst(x: number, y: number, color: number, count = 2): void {
    const emitter = this.emitterFor(color);
    const requested = Math.min(count, FX.burstUnitCap) * FX.particlesPerUnit;
    // 同屏粒子硬上限:当前存活粒子数已经顶格时,新请求按剩余预算截断,
    // 而不是让画面上的粒子无限堆积、拖垮低配设备。
    const budget = Math.max(0, FX.particleCap - this.aliveParticleCount());
    const n = Math.min(requested, budget);
    if (n > 0) {
      emitter.emitParticleAt(x, y, n);
    }
  }

  /**
   * 飘字(比如 "+50")。`FX.floatTextPoolSize` 个常驻 Text 轮转复用,不再
   * 每次 `add.text()`。
   */
  floatText(x: number, y: number, label: string, color: number): void {
    const text = this.texts[this.textCursor];
    this.textCursor = (this.textCursor + 1) % this.texts.length;

    // 复用任何 tween 目标时的通用纪律:先杀掉上一轮可能还没跑完的 tween,
    // 否则两个 tween 会同时抢同一个复用对象的属性,出现抖动/瞬移。
    this.scene.tweens.killTweensOf(text);

    text
      .setPosition(x, y)
      .setText(label)
      .setColor(`#${color.toString(16).padStart(6, '0')}`)
      .setAlpha(1)
      .setVisible(true);

    this.scene.tweens.add({
      targets: text,
      y: y - FX.floatTextRiseDistance,
      alpha: 0,
      duration: 700,
      onComplete: () => text.setVisible(false),
    });
  }

  private createEmitter(color: number): Phaser.GameObjects.Particles.ParticleEmitter {
    return this.scene.add.particles(0, 0, 'tex-spark', {
      // 原来是 { min: 60, max: 230 } 的裸数字,1080p 下实际粒子速度只有
      // 设计意图的一半 —— 空间数值必须过 u()。
      speed: { min: FX.particleSpeedMin, max: FX.particleSpeedMax },
      lifespan: 420,
      scale: { start: 0.9, end: 0 },
      alpha: { start: 1, end: 0 },
      tint: color,
      emitting: false,
    });
  }

  private emitterFor(color: number): Phaser.GameObjects.Particles.ParticleEmitter {
    const emitter = this.emitters.get(color);
    if (!emitter) {
      // 3 个常驻 emitter 只覆盖 THEME.entity 里当前用到的 3 种颜色。换皮/
      // 加新实体颜色时如果忘了在这里补一个 emitter,直接抛错比静默用错
      // 颜色的粒子(或者悄悄不显示)更容易在开发期就被发现。
      throw new Error(`Fx: 没有为颜色 0x${color.toString(16)} 预建 emitter`);
    }
    return emitter;
  }

  private aliveParticleCount(): number {
    let total = 0;
    for (const emitter of this.emitters.values()) {
      total += emitter.getAliveParticleCount();
    }
    return total;
  }
}
