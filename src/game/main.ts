import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from './viewport';
import { THEME } from './theme';
import { BootScene } from './scenes/BootScene';
import { MenuScene } from './scenes/MenuScene';
import { PlayScene } from './scenes/PlayScene';
import { ResultScene } from './scenes/ResultScene';
import { SettingsScene } from './scenes/SettingsScene';

/**
 * 创建 Phaser 游戏实例。
 *
 * 这个文件的位置跟随 Phaser 官方模板的惯例:`src/main.ts` 是浏览器入口
 * (负责宿主页那一侧的事),`src/game/main.ts` 才是游戏本体的入口。
 * 这条边界不只是好看 —— 它让"只有 src/game/** 可以 import phaser"
 * 成为一条可被机器检查的规则(见 scripts/check-boundaries.mjs),
 * 从而保证 dom/ 和 platform/ 在换引擎时真的不用动。
 */
export function createGame(): Phaser.Game {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game-root',
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    backgroundColor: THEME.bg,
    scale: {
      // FIT + CENTER_BOTH:桌面全屏、手机横屏加黑边,两边都不变形。
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    physics: {
      default: 'arcade',
      arcade: { gravity: { x: 0, y: 0 }, debug: false },
    },
    // 顺序即启动顺序:Boot 跑完自己切到 Menu
    scene: [BootScene, MenuScene, PlayScene, ResultScene, SettingsScene],
  });
}
