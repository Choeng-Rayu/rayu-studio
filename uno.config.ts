import { globSync } from 'fast-glob';
import fs from 'node:fs/promises';
import { basename } from 'node:path';
import { defineConfig, presetIcons, presetUno, transformerDirectives } from 'unocss';

const iconPaths = globSync('./icons/*.svg');

const collectionName = 'rayu';

const customIconCollection = iconPaths.reduce(
  (acc, iconPath) => {
    const [iconName] = basename(iconPath).split('.');

    acc[collectionName] ??= {};
    acc[collectionName][iconName] = async () => fs.readFile(iconPath, 'utf8');

    return acc;
  },
  {} as Record<string, Record<string, () => Promise<string>>>,
);

const BASE_COLORS = {
  white: '#FFFFFF',
  gray: {
    50: '#FAFAFA',
    100: '#F5F5F5',
    200: '#E5E5E5',
    300: '#D4D4D4',
    400: '#A3A3A3',
    500: '#737373',
    600: '#525252',
    700: '#404040',
    800: '#262626',
    900: '#171717',
    950: '#0A0A0A',
  },
  /*
   * RayuCode green. Steps 300 and 400 are the two official brand values
   * (#00FF88 and #00CC6E); everything above 500 is derived.
   *
   * Note the deliberately large luminance drop between 400 and 500. The brand
   * green is neon — #00FF88 on white is only 1.34:1, i.e. invisible — so any
   * accent used as text on a light background has to come from 500 or below.
   * 500 (#008F4A) is the highest step that still clears 4:1 on white, which is
   * what makes `text-accent-500 dark:text-accent-400` legible in both themes.
   */
  accent: {
    50: '#E8FFF4',
    100: '#C7FFE4',
    200: '#8FFFC8',
    300: '#00FF88',
    400: '#00CC6E',
    500: '#008F4A',
    600: '#007A3F',
    700: '#006533',
    800: '#005229',
    900: '#003D1F',
    950: '#032616',
  },
  green: {
    50: '#F0FDF4',
    100: '#DCFCE7',
    200: '#BBF7D0',
    300: '#86EFAC',
    400: '#4ADE80',
    500: '#22C55E',
    600: '#16A34A',
    700: '#15803D',
    800: '#166534',
    900: '#14532D',
    950: '#052E16',
  },
  orange: {
    50: '#FFFAEB',
    100: '#FEEFC7',
    200: '#FEDF89',
    300: '#FEC84B',
    400: '#FDB022',
    500: '#F79009',
    600: '#DC6803',
    700: '#B54708',
    800: '#93370D',
    900: '#792E0D',
  },
  red: {
    50: '#FEF2F2',
    100: '#FEE2E2',
    200: '#FECACA',
    300: '#FCA5A5',
    400: '#F87171',
    500: '#EF4444',
    600: '#DC2626',
    700: '#B91C1C',
    800: '#991B1B',
    900: '#7F1D1D',
    950: '#450A0A',
  },
};

const COLOR_PRIMITIVES = {
  ...BASE_COLORS,
  alpha: {
    white: generateAlphaPalette(BASE_COLORS.white),
    gray: generateAlphaPalette(BASE_COLORS.gray[900]),
    red: generateAlphaPalette(BASE_COLORS.red[500]),
    /*
     * Derived from the bright brand green (accent.300), not accent.500.
     * accent.500 is the *readable-on-white* step, so a 10% wash of it is a
     * muddy near-black on the dark surfaces and barely tinted on white. The
     * pale washes and hovers are meant to read as the brand green itself:
     * alpha.accent.10 over white lands on accent.50 and alpha.accent.20 on
     * accent.100, and over `#030507` they reproduce the site's
     * `rgba(0,255,136,0.08)` chip / `rgba(0,255,136,0.18)` glow exactly.
     */
    accent: generateAlphaPalette(BASE_COLORS.accent[300]),
  },
};

export default defineConfig({
  safelist: [...Object.keys(customIconCollection[collectionName] || {}).map((x) => `i-rayu:${x}`)],
  shortcuts: {
    'rayu-ease-cubic-bezier': 'ease-[cubic-bezier(0.4,0,0.2,1)]',
    'transition-theme': 'transition-[background-color,border-color,color] duration-150 rayu-ease-cubic-bezier',
    kdb: 'bg-rayu-elements-code-background text-rayu-elements-code-text py-1 px-1.5 rounded-md',
    'max-w-chat': 'max-w-[var(--chat-max-width)]',
  },
  rules: [
    /**
     * This shorthand doesn't exist in Tailwind and we overwrite it to avoid
     * any conflicts with minified CSS classes.
     */
    ['b', {}],
  ],
  theme: {
    colors: {
      ...COLOR_PRIMITIVES,
      rayu: {
        elements: {
          borderColor: 'var(--rayu-elements-borderColor)',
          borderColorActive: 'var(--rayu-elements-borderColorActive)',
          /*
           * Backs the 11 `ring-rayu-elements-focus` utilities. The token was
           * referenced from the components but never declared here — and without
           * a theme colour UnoCSS emits nothing for the utility at all, so every
           * one of those rings silently rendered no ring. The variable itself
           * lives in variables.scss (opaque green in light, glowing green in dark).
           */
          focus: 'var(--rayu-elements-focus)',
          background: {
            depth: {
              1: 'var(--rayu-elements-bg-depth-1)',
              2: 'var(--rayu-elements-bg-depth-2)',
              3: 'var(--rayu-elements-bg-depth-3)',
              4: 'var(--rayu-elements-bg-depth-4)',
            },
          },
          textPrimary: 'var(--rayu-elements-textPrimary)',
          textSecondary: 'var(--rayu-elements-textSecondary)',
          textTertiary: 'var(--rayu-elements-textTertiary)',
          code: {
            background: 'var(--rayu-elements-code-background)',
            text: 'var(--rayu-elements-code-text)',
          },
          button: {
            primary: {
              background: 'var(--rayu-elements-button-primary-background)',
              backgroundHover: 'var(--rayu-elements-button-primary-backgroundHover)',
              text: 'var(--rayu-elements-button-primary-text)',
            },
            secondary: {
              background: 'var(--rayu-elements-button-secondary-background)',
              backgroundHover: 'var(--rayu-elements-button-secondary-backgroundHover)',
              text: 'var(--rayu-elements-button-secondary-text)',
            },
            danger: {
              background: 'var(--rayu-elements-button-danger-background)',
              backgroundHover: 'var(--rayu-elements-button-danger-backgroundHover)',
              text: 'var(--rayu-elements-button-danger-text)',
            },
          },
          item: {
            contentDefault: 'var(--rayu-elements-item-contentDefault)',
            contentActive: 'var(--rayu-elements-item-contentActive)',
            contentAccent: 'var(--rayu-elements-item-contentAccent)',
            contentDanger: 'var(--rayu-elements-item-contentDanger)',
            backgroundDefault: 'var(--rayu-elements-item-backgroundDefault)',
            backgroundActive: 'var(--rayu-elements-item-backgroundActive)',
            backgroundAccent: 'var(--rayu-elements-item-backgroundAccent)',
            backgroundDanger: 'var(--rayu-elements-item-backgroundDanger)',
          },
          actions: {
            background: 'var(--rayu-elements-actions-background)',
            code: {
              background: 'var(--rayu-elements-actions-code-background)',
            },
          },
          artifacts: {
            background: 'var(--rayu-elements-artifacts-background)',
            backgroundHover: 'var(--rayu-elements-artifacts-backgroundHover)',
            borderColor: 'var(--rayu-elements-artifacts-borderColor)',
            inlineCode: {
              background: 'var(--rayu-elements-artifacts-inlineCode-background)',
              text: 'var(--rayu-elements-artifacts-inlineCode-text)',
            },
          },
          messages: {
            background: 'var(--rayu-elements-messages-background)',
            linkColor: 'var(--rayu-elements-messages-linkColor)',
            code: {
              background: 'var(--rayu-elements-messages-code-background)',
            },
            inlineCode: {
              background: 'var(--rayu-elements-messages-inlineCode-background)',
              text: 'var(--rayu-elements-messages-inlineCode-text)',
            },
          },
          icon: {
            success: 'var(--rayu-elements-icon-success)',
            error: 'var(--rayu-elements-icon-error)',
            primary: 'var(--rayu-elements-icon-primary)',
            secondary: 'var(--rayu-elements-icon-secondary)',
            tertiary: 'var(--rayu-elements-icon-tertiary)',
          },
          preview: {
            addressBar: {
              background: 'var(--rayu-elements-preview-addressBar-background)',
              backgroundHover: 'var(--rayu-elements-preview-addressBar-backgroundHover)',
              backgroundActive: 'var(--rayu-elements-preview-addressBar-backgroundActive)',
              text: 'var(--rayu-elements-preview-addressBar-text)',
              textActive: 'var(--rayu-elements-preview-addressBar-textActive)',
            },
          },
          terminals: {
            background: 'var(--rayu-elements-terminals-background)',
            buttonBackground: 'var(--rayu-elements-terminals-buttonBackground)',
          },
          dividerColor: 'var(--rayu-elements-dividerColor)',
          loader: {
            background: 'var(--rayu-elements-loader-background)',
            progress: 'var(--rayu-elements-loader-progress)',
          },
          prompt: {
            background: 'var(--rayu-elements-prompt-background)',
          },
          sidebar: {
            dropdownShadow: 'var(--rayu-elements-sidebar-dropdownShadow)',
            buttonBackgroundDefault: 'var(--rayu-elements-sidebar-buttonBackgroundDefault)',
            buttonBackgroundHover: 'var(--rayu-elements-sidebar-buttonBackgroundHover)',
            buttonText: 'var(--rayu-elements-sidebar-buttonText)',
          },
          cta: {
            background: 'var(--rayu-elements-cta-background)',
            text: 'var(--rayu-elements-cta-text)',
          },
        },
      },
    },
  },
  transformers: [transformerDirectives()],
  presets: [
    presetUno({
      dark: {
        light: '[data-theme="light"]',
        dark: '[data-theme="dark"]',
      },
    }),
    presetIcons({
      warn: true,
      collections: {
        ...customIconCollection,
      },
      unit: 'em',
    }),
  ],
});

/**
 * Generates an alpha palette for a given hex color.
 *
 * @param hex - The hex color code (without alpha) to generate the palette from.
 * @returns An object where keys are opacity percentages and values are hex colors with alpha.
 *
 * Example:
 *
 * ```
 * {
 *   '1': '#FFFFFF03',
 *   '2': '#FFFFFF05',
 *   '3': '#FFFFFF08',
 * }
 * ```
 */
function generateAlphaPalette(hex: string) {
  return [1, 2, 3, 4, 5, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100].reduce(
    (acc, opacity) => {
      const alpha = Math.round((opacity / 100) * 255)
        .toString(16)
        .padStart(2, '0');

      acc[opacity] = `${hex}${alpha}`;

      return acc;
    },
    {} as Record<number, string>,
  );
}
