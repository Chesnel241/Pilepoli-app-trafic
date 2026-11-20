import type { ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, View, type ModalProps } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Text } from './Text';
import { t } from '../lib/i18n';
import { colors, fonts, radius } from '../theme';

/**
 * Une modale avec ses propres marges de sécurité : sans ça, sur iPhone, les boutons du haut passent sous
 * l'encoche et la barre d'état, et la croix de fermeture devient impossible à toucher.
 */
export function FullModal({ children, ...props }: ModalProps & { children: ReactNode }) {
  return (
    <Modal statusBarTranslucent {...props}>
      <SafeAreaProvider>{children}</SafeAreaProvider>
    </Modal>
  );
}

/** Bouton Fermer bien visible et facile à toucher (48 pt de haut, zone de toucher élargie). */
export function CloseButton({ onPress, light = true, label }: { onPress: () => void; light?: boolean; label?: string }) {
  return (
    <Pressable onPress={onPress} hitSlop={14} accessibilityRole="button" accessibilityLabel={label ?? t('common.close')}
      style={({ pressed }) => [s.btn, light ? s.light : s.dark, pressed && { opacity: 0.8 }]}>
      <View style={s.row}>
        <Text style={[s.x, !light && { color: '#FFFFFF' }]}>✕</Text>
        <Text style={[s.label, !light && { color: '#FFFFFF' }]}>{label ?? t('common.close')}</Text>
      </View>
    </Pressable>
  );
}

const s = StyleSheet.create({
  btn: { minHeight: 48, borderRadius: radius.pill, paddingHorizontal: 16, justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 4 },
  light: { backgroundColor: '#FFFFFF' },
  dark: { backgroundColor: colors.ink },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  x: { fontFamily: fonts.black, fontSize: 16, color: colors.ink },
  label: { fontFamily: fonts.bold, fontSize: 16, color: colors.ink },
});
