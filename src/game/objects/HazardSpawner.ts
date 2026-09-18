import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, u } from '../viewport';
import { HAZARD } from '../tuning';
import type { DifficultySnapshot } from '../core/difficulty';
import { advance } from './spawnClock';

/**
 * 点到线段的最短距离。graze 判定专用,见 `collectNewGrazes` 内的详细推理。
 */
function distancePointToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const abx = bx - ax;
  const aby = by - ay;
  const lengthSq = abx * abx + aby * aby;
  const t = lengthSq === 0 ? 0 : Phaser.Math.Clamp(((px - ax) * abx + (py - ay) * aby) / lengthSq, 0, 1);
  const cx = ax + abx * t;
  const cy = ay + aby * t;
  return Phaser.Math.Distance.Between(px, py, cx, cy);
}

/**
 * system 不许 import GameState —— system 只接受入参、返回结果,把结果写回
 * GameState 是 PlayScene 的事。这条规则买到三样:system 可以脱离 GameState
 * 单独推演;"谁改了分数"永远只有一个答案;不需要事件总线。
 *
 * 对象池四件套(建 / 取 / 重置 / 还),用的是 Phaser 自带的
 * `Physics.Arcade.Group`,没有再包一层自造的 Pool 类 —— 再包一层只是多一个
 * 要维护的东西。三个必须遵守的坑,踩错了表现极难复现:
 *
 *   a. **绝不用 `killAndHide()`。** 已核实源码
 *      (`gameobjects/group/Group.js`),它只做
 *      `setActive(false) + setVisible(false)`,完全不碰物理 body。尸体会
 *      继续留在 Arcade 碰撞检测里,表现为"玩家撞到看不见的东西死掉"。
 *      必须 `disableBody(true, true)`。
 *   b. **`group.get()` 返回 null 就抛,不兜底。** 池开小了会静默不刷怪,
 *      表现是"玩到 90 秒后突然没碎片了",极难查;抛出来才对。
 *   c. **延时回调不能持有对象引用去判断 `active`。** 池化前"對象死了就
 *      destroy()"时这样写是安全的;池化后同一个 JS 对象会被复用成完全
 *      不同的一个实体,`active` 恒为 true 但已经代表别的东西了。这个类
 *      涉及的只有"出屏回收",判断依据是每帧重新计算的屏幕外坐标,不是
 *      延时回调,所以不踩这个坑;`MoteSpawner` 的"存活超时"才会踩,
 *      见那个文件的专门说明。
 */
export class HazardSpawner {
  private readonly _group: Phaser.Physics.Arcade.Group;
  private nextSpawnAt = 0;

  constructor(private readonly scene: Phaser.Scene) {
    this._group = scene.physics.add.group({
      classType: Phaser.Physics.Arcade.Image, // 默认是 ArcadeSprite,会每帧多跑一次动画系统的 preUpdate;贴图不用动画,没必要
      maxSize: HAZARD.poolSize, // 必须设!不设的话 isFull() 永远 false,get() 永远在 new,起不到池化作用
      allowGravity: false,
      createCallback: (go) => {
        (go as Phaser.Physics.Arcade.Image).setCircle(HAZARD.radius, HAZARD.radius, HAZARD.radius);
      },
    });
  }

  get group(): Phaser.Physics.Arcade.Group {
    return this._group;
  }

  /** 生成 + 出屏回收,一处搞定。PlayScene 每帧(playing 态下)调用一次。 */
  update(now: number, d: DifficultySnapshot): void {
    if (now >= this.nextSpawnAt) {
      for (let i = 0; i < d.hazardBatch; i++) {
        this.spawnOne(u(d.hazardSpeed));
      }
      // 生成节奏的推进逻辑(为什么是 nextAt+interval 而不是 now+interval,
      // 以及落后太多时怎么止损)见 `spawnClock.ts` 的 `advance()` 注释,
      // `MoteSpawner` 用的是同一份逻辑。
      this.nextSpawnAt = advance(this.nextSpawnAt, now, d.hazardIntervalMs);
    }
    this.cullOffscreen();
  }

  /** 查询:冲击波半径内当前活跃的 hazard,不改变任何状态。 */
  collectWithin(x: number, y: number, radius: number): Phaser.Physics.Arcade.Image[] {
    const hits: Phaser.Physics.Arcade.Image[] = [];
    for (const obj of this._group.getChildren()) {
      const h = obj as Phaser.Physics.Arcade.Image;
      if (!h.active) continue;
      if (Phaser.Math.Distance.Between(x, y, h.x, h.y) <= radius) {
        hits.push(h);
      }
    }
    return hits;
  }

  /**
   * 返回这一帧**新进入**擦身环带、且还没记过账的碎片。PlayScene 每帧
   * (playing 态下)调用一次,对返回的每个碎片记一次 graze。
   *
   * ── 为什么要用"上一帧位置 → 这一帧位置"的线段判定,而不是当前帧的点判定 ──
   * 碎片速度在难度曲线后期能到 u(400)(≈ 400px/s 的设计单位换算值)。
   * 60Hz 下一帧移动约 u(6.7),144Hz 下一帧只移动约 u(2.8)。如果只看"这一帧
   * 碎片当前位置到玩家的距离",相当于用一系列离散采样点去逼近一条连续穿越
   * 轨迹:低刷新率下采样稀疏,碎片可能一帧还在环带外、下一帧已经穿到环带
   * 内侧甚至穿过玩家本体,中间那次"擦身"被两帧之间的空隙漏掉;高刷新率下
   * 采样密集,同一次擦身会被相邻好几帧重复命中(即使有 grazed 标记去重,
   * 边界附近的抖动也可能被算作多次进出)。这正是 CrazyGames 明文要求的
   * "physics 在 144Hz/165Hz 下表现必须与 60Hz 一致"这条要检查的漏判/多判
   * 问题 —— 不是速度快慢的问题,是判定方式本身跟采样密度绑定了。
   * 改成对"上一次记录位置 → 这一帧位置"的线段做点到线段最短距离判定后,
   * 不管这一帧实际跨过了多少像素,只要线段扫过了环带,就会被判定命中一次;
   * 帧数越多、每段线段越短,不会改变"扫没扫过环带"这个几何结论,漏判/多判
   * 都不再随刷新率变化。
   *
   * ── 去重规则 ──
   * 每个碎片身上用 `setData('grazed', ...)` 记"当前是否处于环带内",距离
   * 完全超出 grazeRadius(彻底脱离)才清除,这样贴着碎片走一整路只在
   * "进入"那一刻记一次账,不会每帧都触发。池化回收(despawn)和复用取出
   * (spawnOne)都要清掉这个标记,否则复用后的新碎片会带着上一位"房客"的
   * 状态,第一次擦身不计分(或者反过来,明明没擦身却因为标记残留而不计分)。
   */
  collectNewGrazes(
    x: number,
    y: number,
    contactRadius: number,
    grazeRadius: number,
  ): Phaser.Physics.Arcade.Image[] {
    const newlyGrazed: Phaser.Physics.Arcade.Image[] = [];

    for (const obj of this._group.getChildren()) {
      const h = obj as Phaser.Physics.Arcade.Image;
      if (!h.active) continue;

      const prevX = (h.getData('grazePrevX') as number | undefined) ?? h.x;
      const prevY = (h.getData('grazePrevY') as number | undefined) ?? h.y;
      const dist = distancePointToSegment(x, y, prevX, prevY, h.x, h.y);
      const wasGrazed = h.getData('grazed') === true;

      if (dist > contactRadius && dist <= grazeRadius) {
        if (!wasGrazed) {
          h.setData('grazed', true);
          newlyGrazed.push(h);
        }
      } else if (dist > grazeRadius) {
        // 彻底脱离环带,才允许下一次"进入"重新计一次账
        h.setData('grazed', false);
      }
      // dist <= contactRadius:真正撞上了,由 Arcade overlap 单独处理,这里不动标记

      h.setData('grazePrevX', h.x);
      h.setData('grazePrevY', h.y);
    }

    return newlyGrazed;
  }

  /** 回收单个 hazard 回池。见类注释坑 a:必须 disableBody,不能 killAndHide。 */
  despawn(h: Phaser.Physics.Arcade.Image): void {
    h.disableBody(true, true);
    // 池化复用前必须清掉 graze 标记,否则下一位"房客"会带着上一轮的状态,
    // 见 collectNewGrazes 的去重规则说明。
    h.setData('grazed', false);
  }

  /** 统一替代散落两处的缓冲窗(暂停恢复 / 复活后延迟下一次生成)。 */
  holdFor(ms: number): void {
    this.nextSpawnAt = this.scene.time.now + ms;
  }

  /** 从屏幕外某条边生成,朝对侧偏随机角度飞过 —— 保证总有可躲的缝隙。 */
  private spawnOne(speed: number): void {
    const edge = Phaser.Math.Between(0, 3);
    const margin = HAZARD.spawnMargin;
    let x = 0;
    let y = 0;

    switch (edge) {
      case 0: x = Phaser.Math.Between(0, GAME_WIDTH); y = -margin; break;
      case 1: x = GAME_WIDTH + margin; y = Phaser.Math.Between(0, GAME_HEIGHT); break;
      case 2: x = Phaser.Math.Between(0, GAME_WIDTH); y = GAME_HEIGHT + margin; break;
      default: x = -margin; y = Phaser.Math.Between(0, GAME_HEIGHT); break;
    }

    const hazard = this._group.get(x, y, 'tex-hazard') as Phaser.Physics.Arcade.Image | null;
    if (!hazard) {
      // 见类注释坑 b:不兜底,立刻暴露,而不是静默不刷怪。
      throw new Error('hazard 池耗尽,HAZARD.poolSize 设小了');
    }

    // **复用任何 tween 目标之前,先杀掉它身上没跑完的 tween。**
    //
    // 这是通用纪律,不是这个文件特有的。碎片恰恰是全局被 tween 得最多的对象:
    // 错峰清场会给它 scale→0,死亡序列会给它 alpha→0.3。如果上一轮的 tween
    // 还在跑就被复用,新碎片会一边飞一边被上一轮的动画缩没 / 变半透明,
    // 表现是"偶尔有碎片自己消失或半透明",而且极难复现。
    //
    // MoteSpawner 里一直有这一行,这里当初漏了 —— 同一条纪律两个文件不一致,
    // 正是最容易出事的形态。
    this.scene.tweens.killTweensOf(hazard);

    // get() 不会帮你重置状态,复用前必须手动 enableBody + 重新赋值速度 /
    // 角速度 / 缩放 / 透明度,否则复用对象会带着上一轮死掉时的状态复活。
    hazard.enableBody(true, x, y, true, true);

    // 朝屏幕中心附近飞,加一点随机偏移,避免全部撞向正中央
    const targetX = GAME_WIDTH / 2 + Phaser.Math.Between(-HAZARD.scatterX, HAZARD.scatterX);
    const targetY = GAME_HEIGHT / 2 + Phaser.Math.Between(-HAZARD.scatterY, HAZARD.scatterY);
    const angle = Phaser.Math.Angle.Between(x, y, targetX, targetY);
    hazard.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
    // 角速度是纯视觉旋转,不涉及空间距离,不需要过 u()
    hazard.setAngularVelocity(Phaser.Math.Between(-HAZARD.spinRange, HAZARD.spinRange));
    hazard.setScale(1).setAlpha(1);
    hazard.clearTint();

    // 取出复用时重置 graze 记账:上一位"房客"的标记和线段起点不能带过来,
    // 见 collectNewGrazes 的去重规则说明。prevX/prevY 从生成点起算,
    // 第一帧的线段就是"生成点 → 第一次物理步进后的位置"。
    hazard.setData('grazed', false);
    hazard.setData('grazePrevX', x);
    hazard.setData('grazePrevY', y);
  }

  /**
   * 出屏回收。这里可以直接遍历 `_group.getChildren()` 边遍历边 `despawn()`,
   * 不需要先 `.slice()` 拷贝一份快照——`despawn()` 只调用 `disableBody()`
   * 把对象标成不活跃、留在池里等复用,不会把它从 group 的成员数组里移除,
   * 所以遍历过程中数组长度和顺序不变,不存在"边销毁边跳过下一个元素"的
   * 风险(这个风险只存在于遍历中真正 `destroy()`、把元素移出数组的写法)。
   */
  private cullOffscreen(): void {
    const pad = HAZARD.cullPadding;
    for (const obj of this._group.getChildren()) {
      const h = obj as Phaser.Physics.Arcade.Image;
      if (!h.active) continue;
      if (h.x < -pad || h.x > GAME_WIDTH + pad || h.y < -pad || h.y > GAME_HEIGHT + pad) {
        this.despawn(h);
      }
    }
  }
}
