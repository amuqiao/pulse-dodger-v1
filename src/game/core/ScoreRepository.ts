/**
 * 存档依赖的抽象签名 —— 相当于 FastAPI 里 `Depends(get_db)` 的那个抽象类型。
 *
 * `GameState`(domain 层)只认这个接口,不知道、也不关心存档最终落在
 * localStorage、CrazyGames cloud save 还是内存 fake 里。
 *
 * 方法故意写成领域语言(best score / runs played),不是 `get(key)/set(key)`:
 * 这样 `SAVE_KEYS` 的字符串 key 和数字解析细节永远留在 infra 层,
 * 不会渗透进 domain。
 */
export interface ScoreRepository {
  loadBestScore(): number;
  saveBestScore(value: number): void;
  loadRunsPlayed(): number;
  saveRunsPlayed(value: number): void;
}
