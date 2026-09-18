import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../viewport';
import { THEME } from '../theme';
import { platform } from '../../platform';
import { audio } from '../effects/audio';
import { Button } from '../ui/Button';
import { SCENES } from './contracts';
import { fadeInScene, fadeToScene } from './transition';

/**
 * 设置页。
 *
 * 核心设计:**内容由平台能力决定,不是写死的。**
 *
 * 一款休闲 web 游戏真正需要玩家调的东西极少,而且其中最主要的一项(音量)
 * 在 CrazyGames 上已经由播放器外框提供了。自己再做一个会出现两个开关打架。
 * 所以这里不写死行数,而是每次按 capabilities 现算 —— 同一份代码
 * 在 CrazyGames 上少一行,在自托管环境上多一行,不需要发行前手动改。
 */

export interface SettingsRow {
  key: string;
  /** 每次进页面现算,因为状态可能变了(例如刚在暂停面板里切过音效) */
  label: () => string;
  onClick: (scene: SettingsScene) => void;
}

/** 当前平台下真正该显示的设置项。空数组 = 连入口按钮都不该画。 */
export function settingsRows(): SettingsRow[] {
  const rows: SettingsRow[] = [];

  if (!platform().capabilities.platformProvidesAudioToggle) {
    rows.push({
      key: 'audio',
      label: () => (audio.isUserMuted ? THEME.copy.soundOff : THEME.copy.soundOn),
      onClick: (scene) => {
        audio.toggleUserMuted();
        scene.refresh();
      },
    });
  }

  return rows;
}

export class SettingsScene extends Phaser.Scene {
  private rowButtons: Button[] = [];

  constructor() {
    super(SCENES.Settings);
  }

  create(): void {
    this.rowButtons = [];
    fadeInScene(this);
    this.cameras.main.setBackgroundColor(THEME.bg);
    const cx = GAME_WIDTH / 2;
    const y = (ratio: number): number => GAME_HEIGHT * ratio;
    const rowStep = THEME.panel.buttonRow + THEME.space.xs;

    this.add
      .text(cx, y(THEME.anchor.heading), THEME.copy.settings, {
        fontSize: THEME.font.heading,
        color: THEME.text.primary,
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    const rows = settingsRows();

    if (rows.length === 0) {
      // 正常情况下 MenuScene 不会让你进到这里。留着是为了万一被直接 start('Settings')
      this.add
        .text(cx, y(THEME.anchor.lead), THEME.copy.settingsEmptyHint, {
          fontSize: THEME.font.small,
          color: THEME.text.dim,
        })
        .setOrigin(0.5);
    }

    rows.forEach((row, index) => {
      const button = new Button(this, cx, y(THEME.anchor.lead) + index * rowStep, row.label(), () => row.onClick(this), {
        variant: 'ghost',
        fixedWidth: THEME.panel.defaultWidth - THEME.space.xl,
      });
      this.rowButtons.push(button);
    });

    this.add
      .text(cx, y(THEME.anchor.lead) + rows.length * rowStep + THEME.space.lg, THEME.copy.controls, {
        fontSize: THEME.font.small,
        color: THEME.text.dim,
        align: 'center',
        wordWrap: { width: GAME_WIDTH * 0.55 },
      })
      .setOrigin(0.5);

    new Button(this, cx, y(THEME.anchor.footer), THEME.copy.back, () => fadeToScene(this, SCENES.Menu), {
      variant: 'primary',
      paddingY: THEME.space.xs,
    });
  }

  /** 切换后就地刷新文案,不用重建整个场景 */
  refresh(): void {
    const rows = settingsRows();
    rows.forEach((row, index) => this.rowButtons[index]?.setLabel(row.label()));
  }
}
