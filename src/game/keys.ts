/**
 * 字符串常量的唯一出处。
 *
 * 存档 key、DOM 元素 id、贴图 key 这类字符串一旦散落各处,改名时
 * TypeScript 一声不吭,表现是运行时读不到存档 / 拿到一个绿色问号方块。
 * 收拢到一处之后,改名就变成编译期问题。
 */

/** 存档 key。加前缀,避免和同域下别的游戏撞车。 */
export const SAVE_KEYS = {
  bestScore: 'pulse-dodger:best-score',
  runsPlayed: 'pulse-dodger:runs-played',
  userMuted: 'pulse-dodger:user-muted',
} as const;

export const BANNER_CONTAINER_ID = 'banner-bottom';
