/** Identité visuelle Pile : blanc, violet électrique, vert citron, noir encre. */
export const colors = {
  bg: '#FFFFFF',
  soft: '#F2F2F5',
  line: '#EDEDF1',
  ink: '#0E0F12',
  muted: '#5C5F6A',
  faded: '#6B6E78',
  violet: '#5B3DF5',
  violetDark: '#4A2FE0',
  violetSoft: '#E6E1FF',
  lime: '#C8FF2E',
  amberBg: '#FFE7B0',
  amberInk: '#6B4500',
  redBg: '#FFE1E1',
  redInk: '#A8191F',
} as const;

export const fonts = {
  display: 'BricolageGrotesque_800ExtraBold',
  displaySemi: 'BricolageGrotesque_600SemiBold',
  body: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semi: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
  black: 'Inter_800ExtraBold',
} as const;

export const radius = { sm: 10, md: 18, lg: 24, xl: 28, pill: 999 } as const;

export type Reliability = 'direct' | 'estime' | 'pas_vu' | 'theorique' | 'supprime';

/** Couleurs des statuts de fiabilité. Le texte est toujours écrit : la couleur n'est jamais seule. */
export const reliabilityStyle: Record<Reliability, { bg: string; fg: string; dot: string; pulse: boolean }> = {
  direct: { bg: colors.lime, fg: colors.ink, dot: colors.ink, pulse: true },
  estime: { bg: colors.amberBg, fg: colors.amberInk, dot: '#B87800', pulse: false },
  theorique: { bg: colors.soft, fg: colors.muted, dot: colors.muted, pulse: false },
  pas_vu: { bg: colors.redBg, fg: colors.redInk, dot: '#D12F35', pulse: false },
  supprime: { bg: colors.redBg, fg: colors.redInk, dot: '#D12F35', pulse: false },
};
