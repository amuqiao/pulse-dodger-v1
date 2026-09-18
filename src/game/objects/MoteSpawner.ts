import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../viewport';
import { MOTE } from '../tuning';
import { THEME } from '../theme';
import type { DifficultySnapshot } from '../core/difficulty';
import { advance } from './spawnClock';

/**
 * system 不许 import GameState —— 见 `HazardSpawner.ts` 顶部同一条注释,
 * 这里不重复。对象池四件套的坑 a(不用 killAndHide)/坑 b(get() 为 null
 * 就抛)也和 `HazardSpawner` 一致,不重复说明,只重点写这个文件特有的坑 c。
 *
 * **坑 c(池化后最危险的一处,必须改掉):延时回调不能持有对象引用去判断
 * `active`。**
 * 池化前的写法是:
 * ```
 * this.time.delayedCall(8000, () => { if (mote.active) mote.destroy(); });
 * ```
 * 这在"被吃掉的 mote 已经 destroy()"的年代是安全的 —— destroy 之后
 * `active` 恒为 false,回调等于自动失效。池化之后,同一个 JS 对象会被
 * `group.get()` 反复复用成完全不同的一个 mote:8 秒后原来那个闭包触发时,
 * `mote.active` 完全可能是 true(它已经变成一个刚生成不久的新 mote),
 * 回调会把一个活着的新 mote 缩没。表现是"偶尔有能量点自己消失",且很难
 * 复现(取决于对象什么时候恰好被复用)。
 *
 * 这里改成:生成时把过期时间戳写进 `setData('expiresAt', ...)`,在
 * `update()` 里遍历当前活跃成员按时间戳判断是否该回收 —— 判断依据永远是
 * "这个对象自己身上此刻的数据",不依赖闭包捕获的、可能早就代表了别的实体
 * 的对象引用。
 */
export class MoteSpawner {
  private readonly _group: Phaser.Physics.Arcade.Group;
  private nextSpawnAt = 0;

  constructor(private readonly scene: Phaser.Scene) {
    this._group = scene.physics.add.group({
      classType: Phaser.Physics.Arcade.Image,
      maxSize: MOTE.poolSize, // 必须设,原因同 HazardSpawner
      allowGravity: false,
      createCallback: (go) => {
        (go as Phaser.Physics.Arcade.Image).setCircle(MOTE.radius, MOTE.radius, MOTE.radius);
      },
    });
  }

  get group(): Phaser.Physics.Arcade.Group {
    return this._group;
  }

  /** 生成 + 存活超时回收,一处搞定。PlayScene 每帧(playing 态下)调用一次。 */
  update(now: number, d: DifficultySnapshot): void {
    if (now >= this.nextSpawnAt) {
      this.spawnOne(now);
      // 推进逻辑见 `spawnClock.ts` 的 `advance()`,和 HazardSpawner 共用同一份,
      // 避免"同一件事两种写法"。
      this.nextSpawnAt = advance(this.nextSpawnAt, now, d.moteIntervalMs);
    }
    this.cullExpired(now);
  }

  /** 回收单个 mote 回池。必须 disableBody,不能 killAndHide(同 HazardSpawner 坑 a)。 */
  despawn(mote: Phaser.Physics.Arcade.Image): void {
    mote.disableBody(true, true);
  }

  /** 统一替代散落两处的缓冲窗(暂停恢复 / 复活后延迟下一次生成)。 */
  holdFor(ms: number): void {
    this.nextSpawnAt = this.scene.time.now + ms;
  }

  /** 暂停期间 active world time 应该冻结,所以恢复时要平移已存在 mote 的过期时间。 */
  extendActiveLifetimes(ms: number): void {
    if (ms < 0) {
      throw new Error(`mote 生命周期不能反向平移: ${ms}`);
    }
    for (const obj of this._group.getChildren()) {
      const mote = obj as Phaser.Physics.Arcade.Image;
      if (!mote.active) continue;
      const expiresAt: unknown = mote.getData('expiresAt');
      if (typeof expiresAt !== 'number') {
        throw new Error('mote 缺少 expiresAt,无法延长暂停期间的生命周期');
      }
      mote.setData('expiresAt', expiresAt + ms);
    }
  }

  private spawnOne(now: number): void {
    const inset = THEME.space.xl;
    const x = Phaser.Math.Between(inset, GAME_WIDTH - inset);
    const y = Phaser.Math.Between(inset, GAME_HEIGHT - inset);

    const mote = this._group.get(x, y, 'tex-mote') as Phaser.Physics.Arcade.Image | null;
    if (!mote) {
      // 见 HazardSpawner 坑 b:不兜底,立刻暴露。
      throw new Error('mote 池耗尽,MOTE.poolSize 设小了');
    }

    // 复用任何 tween 目标时的通用纪律:先杀掉上一轮可能还没跑完的 tween
    // (比如上一次生命周期的入场缩放动画),否则新旧 tween 会同时抢同一个
    // 复用对象的 scale 属性。
    this.scene.tweens.killTweensOf(mote);

    mote.enableBody(true, x, y, true, true);
    mote.setScale(0).setAlpha(1);
    // 坑 c 的修复:把过期时间戳写在对象自己身上,update() 里按时间戳回收,
    // 不再用 delayedCall 闭包捕获对象引用。
    mote.setData('expiresAt', now + MOTE.lifetimeMs);

    this.scene.tweens.add({ targets: mote, scale: 1, duration: 220, ease: 'Back.Out' });
  }

  private cullExpired(now: number): void {
    for (const obj of this._group.getChildren()) {
      const mote = obj as Phaser.Physics.Arcade.Image;
      if (!mote.active) continue;
      const expiresAt: unknown = mote.getData('expiresAt');
      // 不兜底:`spawnOne()` 是这个 group 里唯一的入队路径,取出来的活跃
      // mote 必然带 `expiresAt`。如果哪天有第二条路径把 mote 放进 group
      // 却没设这个字段,`typeof !== 'number'` 时静默当成"永不过期"会让
      // 那颗 mote 永远占着池子还查不出原因——必须在这里就炸出来。
      if (typeof expiresAt !== 'number') {
        throw new Error('mote 缺少 expiresAt,cullExpired 无法判断是否该回收');
      }
      if (now >= expiresAt) {
        this.despawn(mote);
      }
    }
  }
}
