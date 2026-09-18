/**
 * 生成节奏的时间线推进,`HazardSpawner` 和 `MoteSpawner` 共用同一份逻辑。
 *
 * ── 为什么必须是 `nextAt + interval`,不能是 `now + interval` ──
 * `now + interval` 每次都从"当前这一帧实际跑到的时刻"重新起算,而这一刻
 * 本来就比 `nextAt` 晚了(平均晚半帧)。高刷新率下帧更密集、晚的部分占比
 * 更小,实际生成速率就会跟着刷新率走 —— 165Hz 比 60Hz 快约 2%,这正是
 * CrazyGames 明确要求的"生成节奏不能随帧率变化"要检查的问题。
 * `nextAt + interval` 让生成节奏严格锚定在 `nextAt` 自己的时间线上,不再
 * 吃帧率的偏差。
 *
 * ── 但纯 `+=` 也有代价,必须补一个止损 ──
 * 如果这条时间线落后 `now` 太多(例如长时间掉帧、或场景被冻结过一段
 * 时间),下一帧仍会 `now >= nextAt` 成立,从而连续几帧内一次性补发一长串
 * 生成。落后超过 2 个周期就直接丢弃差值,重新从"现在 + 一个周期"起算。
 */
export function advance(nextAt: number, now: number, interval: number): number {
  const next = nextAt + interval;
  return next < now - interval * 2 ? now + interval : next;
}
