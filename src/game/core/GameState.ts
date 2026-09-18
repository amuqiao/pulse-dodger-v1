// 注意这里显式带 `.ts` 扩展名,且需要 tsconfig 里的 `allowImportingTsExtensions`。
// 原因:这个文件既会被 Vite 打包进浏览器 bundle,也会被 `node --test` 直接
// 当 ESM 执行去跑单测 —— 后者是标准 Node ESM 解析,不认"扩展名省略",
// 不带扩展名会在 `node --test` 下直接 `ERR_MODULE_NOT_FOUND`。
// 其余 src 文件(比如 scenes/*)只走 Vite 打包,不会被 node 直接执行,
// 不需要跟进改。
import { COMBO, GRAZE, MOTE, PULSE } from '../tuning.ts';
import type { ScoreRepository } from './ScoreRepository';

/**
 * 一局游戏的状态。和 Phaser 解耦,不引用任何 Scene/GameObject;
 * 也和 infra 解耦,不引用 platform() —— 存档能力通过构造函数注入的
 * `ScoreRepository` 拿到。这样规则可以单独推演和测试(后端里的 domain 层),
 * 测试时用一个内存实现的 fake 换掉真实存档,不需要起 Phaser、不需要浏览器。
 *
 * 依赖关系类比(如果你是 FastAPI 背景):
 *   ScoreRepository 接口           ≈ 依赖的抽象签名(Depends 的类型)
 *   PlatformScoreRepository        ≈ 生产用的 Depends(get_db)
 *   InMemoryScoreRepository(测试)≈ app.dependency_overrides[get_db] = fake
 *   composition.ts                 ≈ 应用启动时的那次 wiring
 */
export class GameState {
  private _score = 0;
  private _charge = 0;
  elapsedMs = 0;

  /** 每局只允许复活一次,避免玩家无限看广告续命导致分数失真。私有,外部只能通过 canRevive / consumeRevive 操作。 */
  private reviveUsed = false;

  // ── 连击(combo) ───────────────────────────────────────────
  /** 当前连击倍率,1..COMBO.maxMultiplier */
  private _multiplier = 1;
  /** 上一次吃点时的 elapsedMs 时间戳;null 表示"还没吃过点,或者连击已超时" */
  private lastMoteAt: number | null = null;
  /** 本局出现过的最高倍率,用于结算页展示,不随倍率归 1 而回退 */
  private _maxCombo = 1;

  // ── 本局统计(结算页用) ───────────────────────────────────
  private _grazes = 0;
  private _motesCollected = 0;
  private _pulsesFired = 0;
  private _hazardsCleared = 0;

  private bestScore: number;
  private readonly scores: ScoreRepository;

  // 注意:不用 TS 的构造函数参数属性写法(`constructor(private readonly x)`)。
  // Node 的 `--experimental-strip-types`(本项目跑测试靠它直接执行 .ts)只做
  // 语法剥离,不支持这种需要类型信息才能展开的语法糖,写了会在 `node --test`
  // 下直接抛 SyntaxError。显式声明字段 + 手动赋值就没有这个问题。
  constructor(scores: ScoreRepository) {
    this.scores = scores;
    this.bestScore = scores.loadBestScore();
  }

  get score(): number {
    return this._score;
  }

  get charge(): number {
    return this._charge;
  }

  get best(): number {
    return this.bestScore;
  }

  get chargeRatio(): number {
    return this._charge / PULSE.maxCharge;
  }

  get pulseReady(): boolean {
    return this._charge >= PULSE.maxCharge;
  }

  /** 这一局是否还能复活。UI 只应该读这个,不应该直接改 reviveUsed。 */
  get canRevive(): boolean {
    return !this.reviveUsed;
  }

  /** 消耗掉这一局唯一的复活机会。第二次调用之后 canRevive 恒为 false。 */
  consumeRevive(): void {
    this.reviveUsed = true;
  }

  /** 当前连击倍率,1..COMBO.maxMultiplier。 */
  get combo(): number {
    return this._multiplier;
  }

  /**
   * 连击窗口剩余比例,0..1,用于 UI 画倒计时细线。
   * 还没吃过点、或者连击已经超时归 1 时,视觉上没有"倒计时"可画,返回 0。
   */
  get comboRemainingRatio(): number {
    if (this.lastMoteAt === null) {
      return 0;
    }
    const remaining = COMBO.windowMs - (this.elapsedMs - this.lastMoteAt);
    return Math.max(0, Math.min(1, remaining / COMBO.windowMs));
  }

  /**
   * 死亡 / 复活时把连击打断归 1。这里只重置连击相关的两个字段,
   * 不动分数、充能、maxCombo(maxCombo 是"本局峰值"的记录,不应该因为
   * 死亡而回退)。由 PlayScene 在死亡编排(handleDeath)里调用一次即可,
   * 因为复活总是发生在死亡之后,不需要在 revive() 里再调一次。
   */
  resetCombo(): void {
    this._multiplier = 1;
    this.lastMoteAt = null;
  }

  collectMote(): void {
    // 距上次吃点在 windowMs 内,倍率 +1(封顶 maxMultiplier);否则(含第一次吃点)归 1。
    const withinComboWindow = this.lastMoteAt !== null && this.elapsedMs - this.lastMoteAt <= COMBO.windowMs;
    this._multiplier = withinComboWindow ? Math.min(COMBO.maxMultiplier, this._multiplier + 1) : 1;
    this.lastMoteAt = this.elapsedMs;
    this._maxCombo = Math.max(this._maxCombo, this._multiplier);

    // 得分随连击倍率放大,但充能故意不乘倍率 —— 这条很重要:
    // 如果充能也跟着倍率走,后期高倍连击会让充能远超"吃点攒能量"这条
    // 主线路本该有的节奏,冲击波会变得唾手可得,彻底失去稀缺性,
    // 也让 GRAZE 路线相形之下毫无意义。
    this._score += MOTE.scorePerMote * this._multiplier;
    this._charge = Math.min(PULSE.maxCharge, this._charge + MOTE.chargePerMote);
    this._motesCollected += 1;
  }

  /**
   * 记一次"擦身而过":贴着碎片边缘但没撞上。这里只负责记账
   * (加分 + 加充能 + 计数),"够不够近算擦身"的几何判定属于 systems 层
   * (用 Phaser.Math.Distance 之类),GameState 不引用任何 Phaser 对象,
   * 也不应该知道这次调用是怎么被触发的。
   *
   * 经济性推算(避免 graze 路线比 mote 路线更快攒出冲击波,喧宾夺主):
   * 难度曲线后期(90s 封顶后)hazardIntervalMs=260ms、hazardBatch=2,
   * 危险物入场速率 ≈ 2 / 0.26s ≈ 7.7 个/秒。假设玩家能贴近其中 30%
   * (即 ≈2.3 次/秒的 graze),每次 +3 充能 → ≈6.9 充能/秒,
   * 充满 maxCharge(100)约需 14.5 秒才能放一次冲击波。
   * 同一时期 mote 路线:moteIntervalMs=1000ms → 1 个/秒,每个 +12 充能
   * → 12 充能/秒,充满约 8.3 秒。两条路线相差约 1.5~1.7 倍、同一量级,
   * 且 graze 风险显著更高(贴着碎片走比吃安全区里的点危险得多)——
   * 不会出现"纯走 graze 就吊打纯吃点"的失衡,数值维持 GRAZE 常量原值不调整。
   */
  grazeHazard(): void {
    this._score += GRAZE.scorePerGraze;
    this._charge = Math.min(PULSE.maxCharge, this._charge + GRAZE.chargePerGraze);
    this._grazes += 1;
  }

  /** 释放冲击波。返回本次得分,调用方用它决定要不要触发 happyTime。 */
  spendPulse(hazardsCleared: number): number {
    this._charge = 0;
    const gained = hazardsCleared * PULSE.scorePerHazardCleared;
    this._score += gained;
    this._pulsesFired += 1;
    this._hazardsCleared += hazardsCleared;
    return gained;
  }

  tick(deltaMs: number): void {
    this.elapsedMs += deltaMs;

    // 连击窗口在两次吃点之间自然超时:不需要等下一次 collectMote() 才发现
    // "已经断了",tick 每帧推进时就把过期的倍率归 1,UI 的
    // comboRemainingRatio 才能诚实地在归零那一刻显示"已断连"。
    if (this.lastMoteAt !== null && this.elapsedMs - this.lastMoteAt > COMBO.windowMs) {
      this._multiplier = 1;
      this.lastMoteAt = null;
    }
  }

  get elapsedSeconds(): number {
    return this.elapsedMs / 1000;
  }

  /**
   * 结算。返回是否破纪录,以及结算后的总局数(runsPlayed),
   * MenuScene / ResultScene 据此展示不同文案、决定要不要打插屏广告。
   */
  finish(): {
    isNewBest: boolean;
    runsPlayed: number;
    previousBest: number;
    maxCombo: number;
    grazes: number;
    motesCollected: number;
    pulsesFired: number;
    hazardsCleared: number;
  } {
    // 先把旧纪录留下来再覆盖 —— 否则结算页拿到的 best 已经等于 score,
    // "超出纪录 N 分"这句话就永远算不出数字了。
    // 这类"写回存档时把原值冲掉"的信息丢失很隐蔽:不是崩溃,是某句文案永远显示不出来。
    const previousBest = this.bestScore;
    const isNewBest = this._score > this.bestScore;
    if (isNewBest) {
      this.bestScore = this._score;
      this.scores.saveBestScore(this.bestScore);
    }
    const runsPlayed = this.scores.loadRunsPlayed() + 1;
    this.scores.saveRunsPlayed(runsPlayed);
    return {
      isNewBest,
      runsPlayed,
      previousBest,
      maxCombo: this._maxCombo,
      grazes: this._grazes,
      motesCollected: this._motesCollected,
      pulsesFired: this._pulsesFired,
      hazardsCleared: this._hazardsCleared,
    };
  }
}
