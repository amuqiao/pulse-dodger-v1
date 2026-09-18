import Phaser from 'phaser';
import { FEEL } from '../tuning';

/**
 * 震屏 / hitstop / 慢动作的唯一入口。
 *
 * system 不许 import GameState —— 这里从头到尾都不需要,纯效果函数,
 * 不持有任何玩法状态。
 *
 * 三个已核实 Phaser 3.90 源码(`node_modules/phaser/src/...`)的坑:
 *
 * 1. **不要用 `scene.time.timeScale` 做慢动作。**
 *    `time/Clock.js#update()` 里 `delta *= this.timeScale` 会同时拖慢你
 *    自己用来"恢复正常速度"的 `delayedCall`(它也挂在同一个 Clock 上)——
 *    恢复逻辑被自己拖慢,实际生效时长完全不可控。这里只碰
 *    `physics.world.timeScale` 和 `tweens.timeScale`,从不touch `scene.time`
 *    本身的 timeScale。
 *
 * 2. **两者语义相反,是最容易写反的一行:**
 *    `Physics.Arcade.World#timeScale` —— 数值越大越慢(2.0 = 半速)。
 *      源码 `physics/arcade/World.js#update()`:
 *      `msPerFrame = this._frameTimeMS * this.timeScale`,乘大了每步之间
 *      的耗时变长,物理步进的频率反而降低。
 *    `Tweens.TweenManager#timeScale` —— 数值越小越慢(0.5 = 半速),是
 *      标准的播放速率语义,和上面完全反着来。
 *
 * 3. **恢复时机一律用未缩放的 `scene.time.now` 绝对时间戳判定,不用帧数、
 *    不用会被缩放的 timer。**
 *    `time/Clock.js#update()`:`this.now = time;` 发生在
 *    `if (this.paused) { return; }` **之前**,是不受 Clock 自身暂停/缩放
 *    影响的墙钟;而 `delayedCall` 是挂在 Clock 的 `_active` 列表里的
 *    TimerEvent,一旦 Clock 暂停(比如 `overlays/PauseController` 在 ESC 暂停
 *    时会设 `scene.time.paused = true`)就会连带被冻结 —— 用它来"恢复"
 *    效果本身,会在暂停期间卡住恢复不了。这里不依赖 delayedCall,自己在
 *    scene 的 UPDATE 事件里轮询 `scene.time.now` 是否已经过了目标时间戳。
 */
function afterUnscaledDelay(scene: Phaser.Scene, ms: number, run: () => void): void {
  const until = scene.time.now + ms;
  const off = (): void => {
    scene.events.off(Phaser.Scenes.Events.UPDATE, tick);
    scene.events.off(Phaser.Scenes.Events.SHUTDOWN, off);
  };
  const tick = (): void => {
    if (scene.time.now < until) {
      return;
    }
    off();
    run();
  };
  scene.events.on(Phaser.Scenes.Events.UPDATE, tick);
  // 场景切走时必须解绑。Phaser 的 Systems.shutdown() **不会**清空 scene.events
  // (只有 destroy() 才 removeAllListeners),而 PlayScene 是反复 scene.start() 重启的。
  // 不解绑的话这个闭包会活到下一局,并在新一局第一帧就满足条件执行 ——
  // 表现是"新的一局刚开始就跑了上一局的死亡收尾"。
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, off);
}

export const feel = {
  /**
   * 震屏。intensity 硬性截断到 `FEEL.shakeIntensityCap`(≈ 11px @1080p)——
   * CrazyGames 大量用户是笔记本触控板和手机,幅度再大就读不出碎片位置。
   * **在躲避游戏里,遮挡信息的 juice 是负 juice。**
   */
  shake(scene: Phaser.Scene, durationMs: number, intensity: number): void {
    const capped = Math.min(intensity, FEEL.shakeIntensityCap);
    scene.cameras.main.shake(durationMs, capped);
  },

  /** 定格:物理和 tween 一起冻住 ms 毫秒再恢复。用于强调一次重击的瞬间。 */
  /**
   * 顿帧。
   *
   * **绝对不要用 `physics.world.isPaused` / `tweens.pauseAll()` 实现它。**
   *
   * 那两个是**共享布尔开关**,PauseController 的暂停用的是同一组。
   * 曾经的写法在 ms 之后无条件写 `isPaused = false` + `resumeAll()`,
   * 于是出现这条触发链:
   *   冲击波命中 ≥3 → 80ms hitstop → 这 80ms 内窗口失焦(自动暂停)
   *   → 暂停面板弹出 → 80ms 到点,hitstop 的恢复回调照常执行
   *   → 物理世界在面板后面继续步进 → 碎片继续飞 → **玩家看着暂停面板死掉**
   *
   * 注意暂停并没有 `scene.pause()`,场景 update 照跑,所以那个回调一定会执行。
   *
   * 改用 timeScale 就没有这个问题:它是数值不是布尔,PauseController 不碰它,
   * 两边天然不打架。而且死亡序列早就在用 slowMo 了,这里只是统一到同一套机制。
   */
  hitstop(scene: Phaser.Scene, ms: number): void {
    this.slowMo(scene, FEEL.hitstopPhysicsScale, FEEL.hitstopTweenScale, ms);
  },

  /**
   * 慢动作。`physicsScale` / `tweenScale` 语义相反,见文件头注释第 2 条 ——
   * 调这两个参数时对着注释核对方向,不要凭直觉猜。
   */
  slowMo(scene: Phaser.Scene, physicsScale: number, tweenScale: number, ms: number): void {
    scene.physics.world.timeScale = physicsScale;
    scene.tweens.timeScale = tweenScale;
    afterUnscaledDelay(scene, ms, () => {
      scene.physics.world.timeScale = 1;
      scene.tweens.timeScale = 1;
    });
  },
};
