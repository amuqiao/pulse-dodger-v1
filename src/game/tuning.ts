import { u } from './viewport.ts';

/**
 * 玩法数值 —— 所有"要调的数"都在这里,换玩法时整个文件重写。
 *
 * 为什么不叫 config.ts:在 Phaser 社区,`config.ts` 有既定含义 ——
 * 它装的是 `Phaser.Types.Core.GameConfig`(`new Phaser.Game(...)` 的那个对象)。
 * 同名不同物比自创名更误导人。
 *
 * ── 哪些数该过 u()、哪些不该 ──
 * 空间类(半径、速度、距离、间距)写成 u(设计单位),跟着分辨率缩放。
 * 非空间类(分数、毫秒、阈值、倍率)是纯数字,**不要**乘 UI_SCALE ——
 * 乘了的话换个分辨率会把游戏平衡一起改掉。
 *
 * ── tuning.ts 和 theme.ts 的真实判据:不是"视觉 vs 玩法",是"换游戏时
 * 会不会被重写" ──
 * 本文件里有一批参数表面看是"纯视觉"(震屏强度、光环延迟、粒子速度、
 * hitstop 时长……),很容易觉得它们该搬去 theme.ts。但 theme.ts 的定位是
 * "换皮时改"——同一款游戏换一套配色/字体/文案,数值本身不需要重新设计,
 * 直接套用旧值就还合理(比如 THEME.space.md 换个主题依然是"中等间距")。
 * 而这批参数即使外观上是"视觉",数值本身是照着**这一款游戏**的实体大小、
 * 速度、节奏专门配出来的手感参数——下一款玩法完全不同的游戏(不是换皮,
 * 是换玩法)必然要重新设计这些数字,不可能照抄。"会不会被换皮者原样沿用"
 * 才是分界线,不是"看起来像不像颜色/像不像坐标"。
 * 因此它们留在 tuning.ts,不是遗漏,也不打算迁移。
 */

export const PLAYER = {
  radius: u(14),
  /**
   * 跟随指针的插值强度。表示"每 16.667ms 向目标靠拢多少比例"。
   * 注意 PlayScene 里会按实际 delta 做帧率补偿 —— 直接每帧乘会导致
   * 144Hz 显示器上跟随速度快 2.4 倍,违反 CrazyGames 的帧率一致性要求。
   */
  followLerp: 0.18,
  /** 键盘速度,设计单位 px/s */
  keyboardSpeed: u(420),
} as const;

/**
 * 触屏上球相对手指的纵向偏移(设计单位,负值 = 球在手指上方)。
 * 触屏躲避类游戏的标准做法:手指本身会挡住球,不偏移的话玩家看不见自己
 * 在控制什么。数值是照着 PLAYER.radius 和手指遮挡范围配出来的,换一款
 * 实体大小不同的游戏就要重新调,不是能直接沿用的视觉 token。
 */
export const TOUCH_OFFSET_Y = u(-70);

export const MOTE = {
  radius: u(8),
  scorePerMote: 10,
  /** 每颗能量豆提供 1 点 pulse 范围累计。3 点可释放,10 点封顶。 */
  chargePerMote: 1,
  /** 生成后活多久没被吃掉就自动消失(ms),避免屏幕上越堆越多 */
  lifetimeMs: 8000,
  /**
   * 对象池容量。由 `core/spawnBudget.ts` 的 `peakMotes()` 实算出理论峰值并发
   * (约 8:`lifetimeMs / 最快生成间隔`),乘 1.5 倍安全冗余后取整 —— 见
   * `tests/spawnBudget.test.ts` 里的断言,调难度曲线把池撑爆时测试会先炸。
   */
  poolSize: 16,
} as const;

export const HAZARD = {
  radius: u(12),
  /** 出屏多远算离场,可以被回收 */
  cullPadding: u(120),
  /** 在屏幕外多远生成 */
  spawnMargin: u(40),
  /** 飞向屏幕中心时的随机偏移范围 */
  scatterX: u(220),
  scatterY: u(140),
  /** 旋转角速度范围(度/秒),纯视觉,不随分辨率变化 */
  spinRange: 120,
  /**
   * 对象池容量。由 `core/spawnBudget.ts` 的 `peakHazards()` 实算出理论峰值
   * 并发(约 19:`双发批次 × 穿屏耗时 / 最短生成间隔`),乘 1.5 倍安全冗余后
   * 取整 —— 见 `tests/spawnBudget.test.ts`。
   */
  poolSize: 32,
} as const;

export const PULSE = {
  /** 吃到 3 个能量豆后可以释放一个小范围 pulse。 */
  minCharge: 3,
  /** 最多累计 10 个能量豆的范围,继续吃只拿分和续 combo。 */
  maxCharge: 10,
  /** 最小可释放半径:救命用,不是高分清场。 */
  radiusMin: u(140),
  /** 满累计半径:高风险贪分后的大清场。 */
  radiusMax: u(360),
  scorePerHazardCleared: 25,
  /** 3 豆时的清场倍率。 */
  rangeMultiplierMin: 1,
  /** 10 豆时的清场倍率。 */
  rangeMultiplierMax: 2.2,
  /**
   * pulse 只吃压缩后的 combo 奖励:普通收集仍是完整 x1..x5,
   * 但清场如果也直接乘完整 combo,会把"攒 10 豆 + 高连击"变成唯一最优解。
   */
  comboMultiplierStep: 0.25,
  /** 一次清掉多少个才算"爽到",触发 platform.happyTime() */
  happyTimeThreshold: 4,

  // ── 错峰清场(见 PlayScene.onPulse / staggeredClear)───────────
  /** 按到玩家距离排序后,第 i 个命中延迟多久才执行"粒子+缩到0+回收" */
  clearStaggerMs: 40,
  /** 每个命中缩到 0 的动画时长 */
  clearShrinkMs: 140,
  /** 第二圈光环相对第一圈的延迟,和 ring2StartRadius/ring2StrokeWidth/
   * ring2StartAlpha 一样,是照 pulse 最大半径和清场节奏配出来的手感参数。 */
  ring2DelayMs: 60,
  /** 第二圈光环的起始半径,和 fx.ts 内部私有的 RING_START_RADIUS 取值
   * 一致(u(5)),但这里是 PlayScene 自己画的独立对象,不依赖 fx.ts 的私有常量。 */
  ring2StartRadius: u(5),
  /** 第二圈线宽 = 第一圈(fx.ts 内 u(2))减半 */
  ring2StrokeWidth: u(1),
  /** 第二圈起始 alpha = 第一圈(1)减半 */
  ring2StartAlpha: 0.5,

  // ── 冲击波命中反馈的震屏/定格/镜头参数,数值是照 pulse 最大半径和这款
  // 游戏的清场节奏专门配出来的手感参数,换玩法必然要重配,不是可沿用的
  // 视觉 token(判据见文件头)。──────────────────────────────
  /** 命中数达到这个数量才触发 hitstop(太小的清场没有"重量感"可言) */
  hitstopMinCount: 3,
  hitstopMs: 80,
  shakeDurationMs: 180,
  /** 震屏强度按 min(命中数, shakeCapCount) / shakeCapCount 插值,封顶在这个数量 */
  shakeCapCount: 6,
  /** 插值后的震屏强度上限,小于 FEEL.shakeIntensityCap(0.01) */
  shakeCapIntensity: 0.006,
  /** 冲击波镜头 zoom punch,只向上不向下 —— FIT 缩放下 zoom < 1 会露出世界外的黑边 */
  zoomPunchScale: 1.02,
  zoomPunchMs: 90,
} as const;

/**
 * 暂停恢复 / 复活后的生成缓冲窗口(毫秒,非空间数值,不过 u())。
 *
 * 两处都要同时推迟 hazard 和 mote 的下一次生成时间,不能只推迟其中一个 ——
 * 原来暂停恢复只推迟了 nextHazardAt,mote 的生成节奏没有跟着停,玩家点
 * "继续"的瞬间仍可能被一颗刚好生成在原地的能量点旁边的碎片撞死。
 */
export const RUN = {
  /** 暂停恢复后的缓冲窗:避免"点继续的瞬间被一直悬在头上的碎片撞死" */
  resumeBufferMs: 600,
  /** 复活后的缓冲窗,比暂停恢复更长,给玩家喘息空间,否则复活即死,广告白看 */
  reviveBufferMs: 1200,
  /**
   * 开局宽限期:HazardSpawner 的 nextSpawnAt 初值是 0,`now >= 0` 第一帧就成立,
   * 会在玩家刚进场、还没看清屏幕时就生成第一批碎片。PlayScene.create() 里
   * 用这个值 holdFor() 一下,给玩家一点反应时间。
   */
  introGraceMs: 900,
  /** 首局(runsPlayed === 0)用更长的宽限期,教学引导(Tutorial)还没走完就被撞死会很挫败 */
  firstRunGraceMs: 1800,
} as const;

/**
 * 特效系统调参(见 `effects/fx.ts`)。粒子数量、速度这些数字是照这款游戏的
 * 实体尺寸和清场规模配的,换一款粒子密度需求不同的游戏就要重新配,
 * 不是能直接沿用的视觉 token(判据见文件头)。
 */
export const FX = {
  /** 同屏粒子硬上限。超预算的新粒子直接裁掉,而不是让 WebGL 批次和 GC 压力失控 */
  particleCap: 120,
  /**
   * 单次 burst() 的"强度单位"上限。`count` 参数不是字面粒子数,而是强度
   * 单位(见 fx.ts 里的换算公式),单位数超过这个值视觉上已经看不出差别。
   */
  burstUnitCap: 8,
  /** 每个强度单位换算成的实际粒子数,`min(count, burstUnitCap) * particlesPerUnit` 即最终粒子数 */
  particlesPerUnit: 6,
  /** 粒子初速度范围,设计单位。原来是 { min: 60, max: 230 } 的裸数字,1080p 下实际速度只有设计意图的一半 */
  particleSpeedMin: u(60),
  particleSpeedMax: u(200),
  /** floatText 常驻对象池大小,轮转复用,不再每次 `add.text()` */
  floatTextPoolSize: 4,
  /** floatText 上升位移,设计单位(原来是裸数字 48) */
  floatTextRiseDistance: u(24),
} as const;

/** 震屏 / hitstop / 慢动作(见 `effects/feel.ts`) */
export const FEEL = {
  /**
   * 震屏强度硬上限(Phaser `CameraShakeEffect` 的 intensity 是画布高度的比例,
   * 不是像素,不过 u())。CrazyGames 大量用户是笔记本触控板和手机,幅度
   * 再大就读不出碎片位置 —— 在躲避游戏里,遮挡信息的 juice 是负 juice。
   */
  shakeIntensityCap: 0.01,

  /**
   * hitstop 用的"近似冻结"倍率。
   *
   * 刻意不用 `physics.pause()` / `tweens.pauseAll()` 这类**共享布尔开关** ——
   * 它们和 PauseController 的暂停是同一组全局状态,谁后恢复谁说了算,
   * 会出现"hitstop 结束时把玩家的暂停一起解除"。timeScale 是数值,
   * 两边互不干扰。详见 feel.hitstop 的注释。
   *
   * physics 的 timeScale 是"越大越慢"(2.0 = 半速),tween 的是"越小越慢"。
   */
  hitstopPhysicsScale: 8,
  hitstopTweenScale: 0.15,
} as const;

/**
 * 连击(combo)节奏参数。目的是逼玩家主动贴近碎片群"抢点",而不是
 * 待在最安全的角落慢慢摸鱼 —— 见 GameState.collectMote() 里的倍率计算。
 */
export const COMBO = {
  /** 距上次吃点在这个窗口内(ms),倍率 +1;超时归 1 */
  windowMs: 2600,
  /** 倍率上限 */
  maxMultiplier: 5,
} as const;

/**
 * 擦身而过(graze)参数。目的是给"贴着碎片边缘走位"一个正向奖励,
 * 而不是只有"离所有碎片越远越好"这一种最优解。
 *
 * radius = u(52):接触判定距离是 PLAYER.radius(u(14)) + HAZARD.radius(u(12))
 * = u(26)(两个圆心距离小于这个数就算撞上)。graze 半径取 2 倍即 u(52),
 * 让"擦身带宽"(graze 半径 − 接触距离 = u(26))正好等于一个碎片的直径
 * (HAZARD.radius(12) 的 2 倍),这样擦身判定区看起来和碎片本身大小相当,
 * 不会宽到"离得老远也算擦身"、也不会窄到几乎不可能触发。
 * 具体的圆心距离几何判定在 systems 层(用 Phaser.Math.Distance),
 * 这里只是数值来源。
 */
export const GRAZE = {
  radius: u(52),
  /** 每次 graze 给 1/4 颗豆的范围累计,作为高风险加速器。 */
  chargePerGraze: 0.25,
  /** 每次 graze 加的分数 */
  scorePerGraze: 2,

  // ── graze 表现参数(见 PlayScene.grazeArc / audio.graze)。数值是照
  // HAZARD.radius 和这款游戏的擦身节奏配出来的手感参数,换玩法要重配
  // (判据见文件头)。────────────────────────────────────────
  /** 连续 graze 计"连击链"的时间窗口(ms),超过这个间隔就重新从 1 计 */
  chainWindowMs: 1500,
  /** 短弧的描边线宽 */
  arcStrokeWidth: u(2),
  /** 短弧半径 = HAZARD.radius + 这个间隙,让弧线贴在碎片边缘外侧 */
  arcRadiusGap: u(4),
  /** 短弧的半张角(度),弧从"碎片朝玩家方向" ± 这个角度 */
  arcHalfSpanDeg: 30,
  /** 短弧淡出时长 */
  arcFadeMs: 120,
} as const;

/**
 * 死亡反馈序列的时序与视觉参数(见 PlayScene.handleDeath)。
 *
 * 全部用绝对时间戳(scene.time.now)编排,不用 delayedCall —— 原因见
 * `effects/feel.ts` 文件头注释第 3 条:一旦有人在别处把 scene.time 本身的
 * timeScale 或 paused 状态改了,delayedCall 的触发时机会被连带拖慢/冻结。
 * timeScale 的实际操作复用 feel.slowMo(),这里只是这套调参 + 编排用的时间表。
 *
 * 时序和数值是照这款游戏死亡反馈的具体节奏(hitstop 多长、慢动作多长、
 * 震屏多强)配出来的手感参数,换玩法要重配,不是能直接沿用的视觉 token
 * (判据见文件头)。
 */
export const DEATH = {
  /** t=0 起的近似定格时长,期间物理/tween 都被 feel.slowMo 拉到接近冻结 */
  hitstopMs: 140,
  hitstopPhysicsScale: 8,
  hitstopTweenScale: 0.15,
  /** hitstopMs 之后紧接的慢动作时长,期间才做"变暗其余碎片/炸开玩家"等表现 */
  slowMoMs: 420,
  slowMoPhysicsScale: 3,
  slowMoTweenScale: 0.45,
  /** 慢动作开始那一刻的震屏 */
  shakeMs: 220,
  shakeIntensity: 0.008,
  /** 碰撞点扩张白环 */
  ringStartRadius: u(10),
  ringEndRadius: u(90),
  ringStrokeWidth: u(4),
  ringDurationMs: 180,
  /** 全屏红色 vignette */
  vignetteAlpha: 0.28,
  vignetteDurationMs: 260,
  /** 除 killer 外其余 hazard/mote 变暗到的 alpha —— 这一条就是"我为什么死"
   * 的全部答案:屏幕上只有一个东西是亮的 */
  dimAlpha: 0.3,
  dimDurationMs: 220,
  /** 玩家炸开的粒子数与视觉动画时长 */
  explodeParticleCount: 24,
  explodeDurationMs: 200,
} as const;
