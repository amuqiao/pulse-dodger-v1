/**
 * 场景间传参的唯一真相(single source of truth)。
 *
 * ── 要解决的真实问题 ──────────────────────────────────────────
 * `scene.start(key, data)` 的官方签名是 `data?: object`,TypeScript 不会检查
 * `data` 里到底有哪些字段。今天发送方这样写:
 *
 *   this.scene.start('Result', { score, best, isNewBest, survivedSeconds });
 *
 * 接收方在 ResultScene 里**另外声明了一份 interface** 去接。两边的类型
 * 之间没有任何关联 —— 发送方把 `survivedSeconds` 改名成 `seconds`,
 * 接收方毫不知情,两边都编译通过,运行时 `this.result.survivedSeconds`
 * 是 `undefined`,页面上悄悄显示 "存活 undefined 秒"。
 *
 * 同时,5 个场景的 key(`'Boot'` / `'Menu'` / `'Play'` / `'Result'` /
 * `'Settings'`)作为字符串字面量散落在各个场景文件里,`this.scene.start('Playy')`
 * 这种手误也是运行时才会暴露(且往往没有任何报错,只是卡在当前场景)。
 *
 * 这个文件把"谁传给谁、传的是什么形状"收拢成一份类型声明:
 * 发送方 `scene.start(key, data)` 和接收方 `init(data)` 只要都引用
 * 这里导出的类型,两边就被同一份类型钉在一起 —— 改坏任何一边,
 * 另一边（乃至编译期）会立刻报错,而不是等到运行时才发现。
 *
 * ── 为什么不引入一个事件总线(event bus)/ pub-sub ──────────────
 * Phaser 本身已经有三级事件系统了:`game.events`(跨场景全局)、
 * `scene.events`(场景生命周期)、`GameObject.emit`(单个对象)。
 * 如果再在它们之上叠一层自造的事件总线,表面上"更解耦",
 * 实际上是拿类型安全换字符串 —— 事件名和 payload 形状又变回了
 * 两边各写各的匿名约定,和本文件要解决的问题一模一样,只是换了个马甲。
 *
 * 更关键的是:本项目的场景跳转数据流是**编译期完全已知的静态单向树**
 * (Boot → Menu → Play → Result → Play → ...),每一条边的发送方和
 * 接收方永远都恰好是 1 对 1,不存在"多个模块都可能关心这份数据"的
 * 广播场景 —— 这正是事件总线该出场的前提,而这里从头到尾都不成立。
 * 引入总线唯一的实际后果,是把 README 里已经点名的"监听不解绑就
 * 泄漏"这个坑(目前项目里只有 2 处需要手动 off,例如 PlayScene 里
 * BLUR/VISIBLE 的解绑),从 2 处扩散到工程里任意一个订阅总线的角落。
 *
 * 真正的问题从来不是"缺一条传递数据的管道"(Phaser 内建的 `scene.start`
 * 管道够用),而是"这条管道两端缺一份共享的类型契约"—— 这份契约用
 * 十几行类型声明就能补齐,不需要新的运行时机制。
 */

/**
 * 全部场景 key 的唯一登记处。
 *
 * 用 `as const` 让每个值都收窄成字符串字面量类型,而不是宽泛的 `string`。
 * 各场景的 `constructor()` 里的 `super('Play')`、任何地方的
 * `this.scene.start('Menu')` 都应该改成引用 `SCENES.Play` / `SCENES.Menu`,
 * 这样字符串拼错的话是编译错误,而不是运行时静默卡住。
 */
export const SCENES = {
  Boot: 'Boot',
  Menu: 'Menu',
  Play: 'Play',
  Result: 'Result',
  Settings: 'Settings',
} as const;

/** `'Boot' | 'Menu' | 'Play' | 'Result' | 'Settings'` */
export type SceneKey = (typeof SCENES)[keyof typeof SCENES];

/**
 * `PlayScene.finishRun()` 传给 `ResultScene.init()` 的数据形状。
 *
 * 这个 interface 一共 11 个字段,覆盖结算页要用到的全部数据:基础结果
 * (score/best/isNewBest/survivedSeconds/runsPlayed/previousBest)加一组
 * 结算统计(maxCombo/grazes/motesCollected/pulsesFired/hazardsCleared)。
 * 往这里加字段时:
 *
 *   1. 在这个 interface 上加一个新字段;
 *   2. `PlayScene.finishRun()` 传的对象字面量如果漏填 —— 编译报错;
 *   3. `ResultScene.init(data: ResultData)` 的 `data` 里就能直接读到新字段,
 *      类型自动可见,不需要再手动同步一份"接收方专属"的 interface。
 *
 * 这正是这个文件存在的全部意义:**发送方和接收方共享同一个类型**,
 * 而不是两份长得像、但没有任何编译期关联的 interface —— 加字段、
 * 删字段、改名字,任何一边漏改都会在 `tsc` 阶段报错,而不是等玩家
 * 打完一局看到 `undefined` 才发现。
 */
export interface ResultData {
  /** 本局最终分数 */
  score: number;
  /** 历史最高分(本局结束时的最新值,可能就是刚打破的这个分数) */
  best: number;
  /** 本局是否刷新了历史最高分 */
  isNewBest: boolean;
  /** 本局存活的秒数(整数) */
  survivedSeconds: number;
  /**
   * 累计游玩局数(**含本局**)。
   *
   * 由 `GameState.finish()` 返回并透传过来,而不是让 ResultScene 自己去查存档 ——
   * 这样广告节奏的判断只依赖一个不可变的 payload,不会因为"查询时机"不同而算错。
   */
  runsPlayed: number;
  /**
   * **破纪录之前**的历史最高分。
   *
   * 为什么不能用 `best` 减一下算出来:`best` 是结算**之后**的值,
   * 破纪录时它已经被覆盖成本局分数,和 `score` 相等。
   * 旧值必须在 `GameState.finish()` 覆盖存档之前就捞出来透传过来。
   */
  previousBest: number;
  /** 本局出现过的最高连击倍率(1..COMBO.maxMultiplier),由 GameState.finish() 带出 */
  maxCombo: number;
  /** 本局擦身而过(graze)次数 */
  grazes: number;
  /** 本局吃到的能量点数 */
  motesCollected: number;
  /** 本局释放冲击波的次数 */
  pulsesFired: number;
  /** 本局被冲击波累计清掉的危险物数量 */
  hazardsCleared: number;
}

/**
 * 场景 key → 该场景 `init(data)` 期望收到的 payload 类型。
 *
 * 没有 payload 的场景(`Boot` / `Menu` / `Play` / `Settings`)显式标成
 * `undefined` —— 而不是省略掉这个 key —— 这样 `SceneDataMap` 对
 * `SceneKey` 里的每个成员都有定义,后续新增场景时,少写一行会在
 * "这是不是 Record<SceneKey, ...> 的完整实现"这类检查里露出破绽
 * (参见下面 `satisfies` 的用法)。
 *
 * `transition.ts` 里的 `fadeToScene<K extends SceneKey>` 就是靠这份映射,
 * 把"跳到哪个场景"和"该传什么形状的数据"在类型层面钉在一起:
 * `fadeToScene(this, SCENES.Result, { score, best, ... })` 如果传的对象
 * 缺字段、多字段或字段类型不对,会直接编译报错。
 */
export interface SceneDataMap {
  [SCENES.Boot]: undefined;
  [SCENES.Menu]: undefined;
  [SCENES.Play]: undefined;
  [SCENES.Result]: ResultData;
  [SCENES.Settings]: undefined;
}

// `satisfies` 只是一次编译期自检:确保上面手写的 SceneDataMap 真的覆盖了
// SCENES 里的每一个 key,不多不少。不产生任何运行时代码。
void (0 as unknown as SceneDataMap satisfies Record<SceneKey, unknown>);
