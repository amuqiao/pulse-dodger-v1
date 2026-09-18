/**
 * 场景淡入淡出转场。
 *
 * ── 为什么用 Camera 内建的 fadeOut/fadeIn,不手搓一个 Container ──────
 * 一种常见的野路子做法是:new 一个盖满全屏的黑色矩形,把它加进场景,
 * 再用 tween 改它的 alpha。这样做至少有三个问题:
 *   1. 它只挡住"加进这个矩形之下"的对象,任何 setDepth 比它高、或者
 *      属于别的 Camera / 别的 Layer 的东西(比如 HUD、DOM 遮罩)盖不住;
 *   2. 它和场景里各对象自己的 alpha 动画(比如本项目 revive() 里玩家
 *      的无敌闪烁 tween)会互相踩踏 —— 两边都在改自己那份 alpha,
 *      互不知道对方存在,叠加结果说不清楚;
 *   3. 它是场景树里的一个普通 GameObject,受 tweens.pauseAll() /
 *      time.paused 这些"暂停游戏"的开关影响,场景暂停时转场跟着卡住。
 *
 * Camera 自带的 `fadeOut`/`fadeIn` 是渲染管线的最后一步(post-render 阶段
 * 对整个 Camera 输出做颜色叠加),不属于场景对象树,不会和场景内任何
 * 对象的 alpha 打架,而且天然由 delta 驱动(内部按毫秒插值,不是按帧数
 * 插值),所以不同刷新率的显示器上淡入淡出的观感时长是一致的 ——
 * 这和 README 里"所有运动必须做帧率补偿"是同一个要求,只是 Phaser
 * 在 Camera fade 这里已经内置实现了,不需要我们自己再补偿一遍。
 *
 * ── 两个不在这个文件里处理、但必须写清楚的坑 ─────────────────────
 *
 * 坑 1 · fadeToScene 只负责"转场"这一小段,不负责"让玩家看清发生了什么":
 *   `fadeToScene` 的 200ms 淡出是纯粹的画面过渡,如果调用方在死亡/结算
 *   这类"刚发生了一件大事"的时刻立刻调用它,震屏、爆炸粒子这些还没演完
 *   的反馈会被硬生生盖上黑屏切掉,玩家来不及看清自己是怎么死的。
 *   `PlayScene.finishRun()` 的做法是先用 `DEATH_HOLD_MS`(240ms)定格,
 *   把 `cameras.main.shake()` 和爆炸粒子的演出时间留出来,画面还在动、
 *   不需要黑屏,定格结束后才调用这里的 `fadeToScene` 接上它自己的 200ms
 *   淡出——这是调用方(具体场景)的编排职责,本文件只提供
 *   `fadeToScene`/`fadeInScene` 这两个转场原语,不关心调用方在此之前
 *   做了什么。
 *
 * 坑 2 · 暂停面板(Panel)不能用 camera fade 做出现/消失动画:
 *   `cameras.main.fadeOut/fadeIn` 是对**整个 Camera 输出**叠加一层纯色,
 *   面板本身也画在这个 Camera 上,一起被淡成黑色 / 淡回来 —— 结果是
 *   "全屏黑一下,面板忽然出现",而不是"面板自己弹出来"。暂停面板要的
 *   是面板这一个 GameObject(或它的 Container)自己的进场/退场动画,
 *   必须用 `Panel` 自己的 scale + alpha tween(现状就是这样,
 *   参见 `ui/Panel.ts`),不能也不应该改成调用这个文件里的函数。
 */

import Phaser from 'phaser';
import { THEME } from '../theme';
import type { SceneDataMap, SceneKey } from './contracts';

/**
 * 淡出时长(毫秒)。
 *
 * 单独作为本文件的常量导出,而不是并进 `THEME`:转场时长是"这个转场
 * 函数自己的实现细节",换皮(改配色、字号、文案)不会想去调它,调它
 * 的场景永远是"觉得转场太快/太慢"这个和视觉主题无关的诉求,所以不需要
 * 经过 THEME 这层。
 *
 * 注意:这是"毫秒时长",不是空间数值,**不需要**、也不应该过 `viewport.ts`
 * 的 `u()`——`u()` 只用来把设计单位换算成像素,时长和分辨率无关。
 */
export const FADE_OUT_MS = 200;

/** 淡入时长(毫秒)。比淡出略长,让新场景内容"缓缓浮现"而不是硬切。 */
export const FADE_IN_MS = 260;

/**
 * 把 24 位 RGB 的十六进制颜色(例如 `0x080b14`)拆成 Camera fade API
 * 要的 r/g/b 三个 0-255 分量。
 *
 * `THEME.bg` 存的是这种十六进制数字(给 `setBackgroundColor` 这类接口用),
 * 而 `Camera.fadeOut(duration, red, green, blue)` 要的是拆开的三个分量 ——
 * 这里做的只是进制换算,不是又发明一份颜色定义,所以不算"硬编码颜色":
 * 换主题时只要改 `THEME.bg` 这一处,这里会自动跟着算出新的 r/g/b。
 */
function hexToRgb(hex: number): { r: number; g: number; b: number } {
  return {
    r: (hex >> 16) & 0xff,
    g: (hex >> 8) & 0xff,
    b: hex & 0xff,
  };
}

/**
 * 把场景淡出,淡出完成后再跳转到目标场景。
 *
 * 类型层面:`key` 的类型是 `SceneKey`(见 `scenes/contracts.ts`),
 * `data` 的类型由 `SceneDataMap[K]` 决定 —— 跳到 `'Result'` 必须传
 * `ResultData` 形状的对象,跳到没有 payload 的场景(`'Menu'`/`'Play'`
 * 等)则 `data` 应该是 `undefined`。写错场景名或者传错 payload 形状,
 * 在这里调用的地方就会编译报错,不会等到运行时才发现。
 *
 * @param scene 发起转场的场景实例(即调用方的 `this`)
 * @param key   目标场景 key,建议传 `SCENES.xxx` 而不是裸字符串
 * @param data  目标场景 `init()` 期望收到的数据,类型由 key 决定
 */
type FadeToSceneArgs<K extends SceneKey> = SceneDataMap[K] extends undefined
  ? [scene: Phaser.Scene, key: K]
  : [scene: Phaser.Scene, key: K, data: SceneDataMap[K]];

export function fadeToScene<K extends SceneKey>(
  ...[scene, key, data]: FadeToSceneArgs<K>
): void {
  // ------------------------------------------------------------------
  // 关键点:fadeOut 之前必须先关掉这个场景的输入。
  //
  // `cameras.main.fadeOut` 只是启动一段 200ms 的渲染插值,它**不会**
  // 阻塞、也不会自动屏蔽玩家输入 —— 场景在这 200ms 内照常 update(),
  // 照常响应点击/触摸。如果这时候玩家又点了一下(很常见,尤其是
  // "点击任意位置开始"这类大范围热区的按钮,参见 MenuScene 的
  // `this.input.once('pointerdown', ...)`),就会在同一个场景里
  // 触发第二次 `fadeToScene` 调用:第二次调用会再挂一个
  // `FADE_OUT_COMPLETE` 监听、再启动一次 fade,等第一次 fade 完成时,
  // 两个监听会先后触发两次 `scene.scene.start(key, data)`。
  // Phaser 允许对同一个场景重复调用 start(),后果是该场景被
  // 关闭再重新创建一次(`shutdown` → `init` → `create` 再跑一遍),
  // 在 Result/Settings 这类会调用 `platform().showBanner()` /
  // `showInterstitial()` 的场景上,这意味着广告或横幅被请求两次。
  //
  // 这和 README「三条不能破的规矩」里提到的
  // "场景切走时必须解绑自己注册的全局监听" 是同一类问题的另一种表现:
  // Phaser 的场景/相机机制默认不会替你把"正在发生的异步流程"和
  // "外部还能继续产生新输入"这两件事互斥起来,必须自己手动关输入。
  // 对称地,新场景 create() 时输入默认是启用的,不需要我们手动打开;
  // 如果目标场景本身也需要在 create() 里临时禁用输入(等待某个初始化
  // 完成),那是该场景自己的职责,不属于这个转场工具函数要管的事。
  // ------------------------------------------------------------------
  scene.input.enabled = false;

  const { r, g, b } = hexToRgb(THEME.bg);

  // 必须等 FADE_OUT_COMPLETE 事件真正触发之后再 start,而不是用
  // `scene.time.delayedCall(FADE_OUT_MS, ...)` 自己掐时间猜——
  // delayedCall 受 `this.time.paused` 影响(暂停中会被冻结,和 tween
  // 时长脱节),而 FADE_OUT_COMPLETE 是相机 fade 真正播完时才发出的,
  // 两者不保证同步。用事件而不是猜时长,是这里唯一正确的写法。
  scene.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
    scene.scene.start(key, data);
  });

  scene.cameras.main.fadeOut(FADE_OUT_MS, r, g, b);
}

/**
 * 让当前场景从纯色(`THEME.bg`)淡入。
 *
 * 用法:新场景在自己的 `create()` 末尾调用一次即可。不需要手动重新
 * 启用 `scene.input` —— 每次 `scene.scene.start()` 都会让 Phaser
 * 重新走一遍该场景的 `init`/`preload`/`create`,场景的 `Input.InputPlugin`
 * 是随场景一起重建的,`input.enabled` 默认就是 `true`。
 *
 * @param scene 刚创建、需要淡入的场景实例(即调用方的 `this`)
 */
export function fadeInScene(scene: Phaser.Scene): void {
  const { r, g, b } = hexToRgb(THEME.bg);
  scene.cameras.main.fadeIn(FADE_IN_MS, r, g, b);
}
