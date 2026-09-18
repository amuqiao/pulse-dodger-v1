import Phaser from 'phaser';
import { hex, THEME } from '../theme';
import { u } from '../viewport';

export interface ButtonOptions {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  onClick(): void;
}

export function createButton(scene: Phaser.Scene, options: ButtonOptions): Phaser.GameObjects.Container {
  const bg = scene.add
    .rectangle(0, 0, options.width, options.height, hex(THEME.color.accent), 1)
    .setStrokeStyle(u(2), hex(THEME.color.text), 0.9);
  const label = scene.add
    .text(0, 0, options.text, {
      fontFamily: 'Arial, sans-serif',
      fontSize: `${u(28)}px`,
      color: THEME.color.background,
      fontStyle: 'bold',
    })
    .setOrigin(0.5);

  const container = scene.add.container(options.x, options.y, [bg, label]);
  container.setSize(options.width, options.height);
  container.setInteractive({ useHandCursor: true });
  container.on(Phaser.Input.Events.POINTER_OVER, () => bg.setFillStyle(hex(THEME.color.warning), 1));
  container.on(Phaser.Input.Events.POINTER_OUT, () => bg.setFillStyle(hex(THEME.color.accent), 1));
  container.on(Phaser.Input.Events.POINTER_DOWN, options.onClick);
  return container;
}

