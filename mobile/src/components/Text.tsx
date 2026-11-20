import type { ComponentRef, Ref } from 'react';
import { StyleSheet, Text as RNText, TextInput as RNTextInput, type TextInputProps, type TextProps } from 'react-native';
import { useSettings } from '../lib/settings';
import { colors } from '../theme';

/** Gris secondaires sur fond clair : en contraste renforcé, ils passent à l'encre. */
const SOFT_ON_LIGHT = new Set<string>([colors.muted, colors.faded, '#3A3D46', '#2B2E14']);
/** Gris et violets clairs sur fond sombre : en contraste renforcé, ils passent au blanc. */
const SOFT_ON_DARK = new Set<string>(['#D7D7DE', colors.violetSoft]);

function adapt(style: TextProps['style'], scale: number, contrast: boolean) {
  if (scale === 1 && !contrast) return style;
  const flat = StyleSheet.flatten(style) ?? {};
  const out: Record<string, unknown> = { ...flat };
  if (scale !== 1) {
    if (typeof flat.fontSize === 'number') out.fontSize = Math.round(flat.fontSize * scale);
    if (typeof flat.lineHeight === 'number') out.lineHeight = Math.round(flat.lineHeight * scale);
  }
  if (contrast && typeof flat.color === 'string') {
    if (SOFT_ON_LIGHT.has(flat.color)) out.color = colors.ink;
    else if (SOFT_ON_DARK.has(flat.color)) out.color = '#FFFFFF';
  }
  return out;
}

/**
 * Le texte de l'appli : il suit la taille et le contraste choisis dans les réglages,
 * en plus du réglage de taille du système (Dynamic Type), plafonné pour ne pas casser la mise en page.
 */
export function Text({ style, ...rest }: TextProps) {
  const { settings } = useSettings();
  return <RNText maxFontSizeMultiplier={1.6} {...rest} style={adapt(style, settings.textScale, settings.contrast)} />;
}

export type TextInputHandle = ComponentRef<typeof RNTextInput>;

export function TextInput({ style, ref, ...rest }: TextInputProps & { ref?: Ref<TextInputHandle> }) {
  const { settings } = useSettings();
  return <RNTextInput ref={ref} maxFontSizeMultiplier={1.6} {...rest} style={adapt(style, settings.textScale, settings.contrast) as TextInputProps['style']} />;
}
