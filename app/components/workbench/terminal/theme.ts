import type { ITheme } from '@xterm/xterm';

const style = getComputedStyle(document.documentElement);
const cssVar = (token: string) => style.getPropertyValue(token) || undefined;

export function getTerminalTheme(overrides?: ITheme): ITheme {
  return {
    cursor: cssVar('--rayu-elements-terminal-cursorColor'),
    cursorAccent: cssVar('--rayu-elements-terminal-cursorColorAccent'),
    foreground: cssVar('--rayu-elements-terminal-textColor'),
    background: cssVar('--rayu-elements-terminal-backgroundColor'),
    selectionBackground: cssVar('--rayu-elements-terminal-selection-backgroundColor'),
    selectionForeground: cssVar('--rayu-elements-terminal-selection-textColor'),
    selectionInactiveBackground: cssVar('--rayu-elements-terminal-selection-backgroundColorInactive'),

    // ansi escape code colors
    black: cssVar('--rayu-elements-terminal-color-black'),
    red: cssVar('--rayu-elements-terminal-color-red'),
    green: cssVar('--rayu-elements-terminal-color-green'),
    yellow: cssVar('--rayu-elements-terminal-color-yellow'),
    blue: cssVar('--rayu-elements-terminal-color-blue'),
    magenta: cssVar('--rayu-elements-terminal-color-magenta'),
    cyan: cssVar('--rayu-elements-terminal-color-cyan'),
    white: cssVar('--rayu-elements-terminal-color-white'),
    brightBlack: cssVar('--rayu-elements-terminal-color-brightBlack'),
    brightRed: cssVar('--rayu-elements-terminal-color-brightRed'),
    brightGreen: cssVar('--rayu-elements-terminal-color-brightGreen'),
    brightYellow: cssVar('--rayu-elements-terminal-color-brightYellow'),
    brightBlue: cssVar('--rayu-elements-terminal-color-brightBlue'),
    brightMagenta: cssVar('--rayu-elements-terminal-color-brightMagenta'),
    brightCyan: cssVar('--rayu-elements-terminal-color-brightCyan'),
    brightWhite: cssVar('--rayu-elements-terminal-color-brightWhite'),

    ...overrides,
  };
}
