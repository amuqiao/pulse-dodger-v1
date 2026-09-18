/**
 * 插屏广告的节奏规则 —— 这是变现策略,不是 UI 细节。
 *
 * 和难度曲线一样,这条规则换游戏必调、也最值得单测,所以从 `ResultScene`
 * 里抽出来,单独放在 domain 层的纯函数里。
 *
 * 规则:第 1、2 局结束不打,第 3 局开始每满 3 局打一次
 * (第 3、6、9…局)。第一局就塞广告是最伤新玩家留存的做法,
 * 让玩家先玩到"還想再来一局"的心态,再开始恰饭。
 *
 * 调用约定:`GameState.finish()` 会先把 runsPlayed 自增,
 * 所以这里传入的是"这一局结束后,总共玩了几局"。
 */
export function shouldShowInterstitial(runsPlayed: number): boolean {
  return runsPlayed > 1 && runsPlayed % 3 === 0;
}
