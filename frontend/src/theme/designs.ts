import { createTheme, type CSSVariablesResolver, type MantineThemeOverride } from '@mantine/core';

export interface Design {
  id: string;
  label: string;
  description: string;
  /** 'auto' follows the operating system's light/dark setting. */
  colorScheme: 'light' | 'dark' | 'auto';
  theme: MantineThemeOverride;
  /** Page background (behind cards), per color scheme. */
  background?: { light?: string; dark?: string };
  /** Colors shown in the picker swatch. */
  swatch: [string, string, string];
}

const terracotta = [
  '#fdf1ec',
  '#f8dfd3',
  '#f0bba5',
  '#e89574',
  '#e1754b',
  '#dd6131',
  '#db5723',
  '#c24817',
  '#ad3f12',
  '#97340b',
] as const;

// Deep navy replaces Mantine's neutral greys in dark mode.
const navy = [
  '#c9cedc',
  '#a6aeca',
  '#7d87a8',
  '#5a6588',
  '#3b4566',
  '#2a3352',
  '#1e2640',
  '#161c31',
  '#111627',
  '#0b0f1c',
] as const;

export const DESIGNS: Design[] = [
  {
    id: 'clasico',
    label: 'Clásico',
    description: 'Verde azulado, limpio. Sigue el modo claro/oscuro del sistema.',
    colorScheme: 'auto',
    theme: createTheme({
      primaryColor: 'teal',
      fontFamily: "'Inter Variable', system-ui, sans-serif",
      defaultRadius: 'md',
    }),
    swatch: ['#12b886', '#ffffff', '#212529'],
  },
  {
    id: 'oceano',
    label: 'Océano',
    description: 'Índigo sobre fondo azul suave, esquinas redondeadas.',
    colorScheme: 'light',
    theme: createTheme({
      primaryColor: 'indigo',
      fontFamily: "'Plus Jakarta Sans Variable', system-ui, sans-serif",
      headings: {
        fontFamily: "'Plus Jakarta Sans Variable', system-ui, sans-serif",
        fontWeight: '700',
      },
      defaultRadius: 'lg',
    }),
    background: { light: '#f3f5fc' },
    swatch: ['#4c6ef5', '#f3f5fc', '#1b2559'],
  },
  {
    id: 'medianoche',
    label: 'Medianoche',
    description: 'Modo oscuro azul marino con acentos violeta.',
    colorScheme: 'dark',
    theme: createTheme({
      primaryColor: 'violet',
      primaryShade: { light: 6, dark: 5 },
      colors: { dark: navy },
      fontFamily: "'Manrope Variable', system-ui, sans-serif",
      headings: { fontFamily: "'Manrope Variable', system-ui, sans-serif", fontWeight: '800' },
      defaultRadius: 'lg',
    }),
    background: { dark: '#0d1222' },
    swatch: ['#9775fa', '#161c31', '#0d1222'],
  },
  {
    id: 'terracota',
    label: 'Terracota',
    description: 'Tonos cálidos sobre crema, títulos con serifa.',
    colorScheme: 'light',
    theme: createTheme({
      primaryColor: 'terracotta',
      primaryShade: 6,
      colors: { terracotta },
      fontFamily: "'DM Sans Variable', system-ui, sans-serif",
      headings: { fontFamily: "'Fraunces Variable', Georgia, serif", fontWeight: '600' },
      defaultRadius: 'sm',
    }),
    background: { light: '#faf6f0' },
    swatch: ['#db5723', '#faf6f0', '#3d2c22'],
  },
];

export const DEFAULT_DESIGN = DESIGNS[0]!;

export function findDesign(id: string | null): Design {
  return DESIGNS.find((d) => d.id === id) ?? DEFAULT_DESIGN;
}

/** Applies the design's page background via Mantine's body color variable. */
export function backgroundResolver(design: Design): CSSVariablesResolver {
  const body = (color?: string): Record<string, string> =>
    color ? { '--mantine-color-body': color } : {};
  return () => ({
    variables: {},
    light: body(design.background?.light),
    dark: body(design.background?.dark),
  });
}
