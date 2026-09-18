export const THEME = {
  color: {
    background: '#101418',
    panel: '#182025',
    panelStroke: '#f5f3e7',
    text: '#f5f3e7',
    muted: '#a7b0ad',
    accent: '#37a094',
    warning: '#e9b34c',
    danger: '#e35b4f',
  },
  text: {
    title: 'Template Runner',
    subtitle: 'Collect signals, dodge hazards, ship faster.',
    start: 'START',
    retry: 'PLAY AGAIN',
    menu: 'MENU',
    pause: 'PAUSED',
    resume: 'RESUME',
  },
};

export const hex = (value: string): number => Number.parseInt(value.slice(1), 16);

