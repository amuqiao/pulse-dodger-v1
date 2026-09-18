/**
 * 难度曲线。刻意做成**纯函数**:输入存活秒数,输出这一刻的生成参数。
 * 好处是可以直接单元测试,也方便用表格核对手感,不用进游戏反复试。
 */
export interface DifficultySnapshot {
  /** 两个危险物之间的生成间隔(ms) */
  hazardIntervalMs: number;
  /** 危险物移动速度(px/s) */
  hazardSpeed: number;
  /** 每次生成几个 */
  hazardBatch: number;
  /** 能量点生成间隔(ms) */
  moteIntervalMs: number;
}

/**
 * 难度爬坡到封顶所需的秒数。
 *
 * **导出出去是为了消灭重复**:顶部的难度时间轴(ui/RunTimeline)要按这个数字
 * 算填充进度和刻度位置。写两份的话改一个忘一个,时间轴的刻度就会和实际的
 * 难度切换点对不上 —— 而这种错不会崩溃,只会让玩家觉得"预告是骗人的"。
 */
export const DIFFICULTY_RAMP_SECONDS = 90;

/** 碎片开始双发的时刻。同样被时间轴用来画刻度,所以必须是唯一真相。 */
export const DOUBLE_SPAWN_SECONDS = 45;

export function difficultyAt(elapsedSeconds: number): DifficultySnapshot {
  // 在 DIFFICULTY_RAMP_SECONDS 内从 0 线性爬到 1,之后封顶。
  // 给新手足够的"我还行"的窗口期。
  const t = Math.min(elapsedSeconds / DIFFICULTY_RAMP_SECONDS, 1);

  return {
    hazardIntervalMs: lerp(900, 260, t),
    hazardSpeed: lerp(150, 400, t),
    hazardBatch: elapsedSeconds > DOUBLE_SPAWN_SECONDS ? 2 : 1,
    // 能量点保持稳定供给,否则后期没法充能,难度会陡然失控
    moteIntervalMs: lerp(1400, 1000, t),
  };
}

function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t;
}
