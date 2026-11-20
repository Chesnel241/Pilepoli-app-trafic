import { useEffect, useRef } from 'react';
import { router } from 'expo-router';
import { Animated, Easing, Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import { Text } from './Text';
import { Text as FixedText } from 'react-native';
import { colors, fonts, radius, reliabilityStyle, type Reliability } from '../theme';
import { Wordmark } from './Wordmark';
import { t } from '../lib/i18n';
import { useI18n } from '../lib/settings';

/** Point qui pulse : signale une info vue en direct. */
export function PulseDot({ color = colors.ink, size = 8 }: { color?: string; size?: number }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(v, { toValue: 1, duration: 1500, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [v]);
  return (
    <View style={{ width: size, height: size }}>
      <Animated.View
        style={{
          position: 'absolute', width: size, height: size, borderRadius: size / 2, backgroundColor: color,
          opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] }),
          transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [1, 2.6] }) }],
        }}
      />
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }} />
    </View>
  );
}

export function StatusChip({ reliability, label }: { reliability: Reliability; label: string }) {
  const s = reliabilityStyle[reliability];
  return (
    <View style={[styles.chip, { backgroundColor: s.bg }]}>
      {s.pulse ? <PulseDot color={s.dot} size={7} /> : <View style={[styles.dot, { backgroundColor: s.dot }]} />}
      <Text style={[styles.chipText, { color: s.fg }]}>{label}</Text>
    </View>
  );
}

export function LineBadge({ code, color, textColor = '#FFFFFF', size = 40, round = false }: {
  code: string; color: string; textColor?: string; size?: number; round?: boolean;
}) {
  return (
    <View
      accessibilityLabel={t('common.line', { code })}
      style={{ width: size, height: size, borderRadius: round ? size / 2 : size * 0.3, backgroundColor: color, alignItems: 'center', justifyContent: 'center' }}
    >
      {/* Taille fixe : le badge est une pastille, le texte ne doit pas en déborder. */}
      <FixedText allowFontScaling={false} style={{ color: textColor, fontFamily: fonts.black, fontSize: code.length > 2 ? size * 0.36 : size * 0.46 }}>{code}</FixedText>
    </View>
  );
}

export function BigButton({ label, onPress, tone = 'lime', style }: {
  label: string; onPress: () => void; tone?: 'lime' | 'ink' | 'white'; style?: ViewStyle;
}) {
  const bg = tone === 'lime' ? colors.lime : tone === 'ink' ? colors.ink : colors.bg;
  const fg = tone === 'ink' ? '#FFFFFF' : colors.ink;
  const scale = useRef(new Animated.Value(1)).current;
  const press = (down: boolean) => {
    Animated.spring(scale, { toValue: down ? 0.97 : 1, damping: 18, stiffness: 260, useNativeDriver: true }).start();
  };
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      onPressIn={() => press(true)}
      onPressOut={() => press(false)}
    >
      <Animated.View style={[styles.big, { backgroundColor: bg, transform: [{ scale }] }, style]}>
        <Text style={[styles.bigText, { color: fg }]}>{label}</Text>
      </Animated.View>
    </Pressable>
  );
}

export function IconButton({ label, onPress, children, dark = false }: {
  label: string; onPress: () => void; children: React.ReactNode; dark?: boolean;
}) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={8}
      style={[styles.icon, { backgroundColor: dark ? colors.violetDark : colors.soft }]}>
      {children}
    </Pressable>
  );
}

export function Logo({ size = 26, dot = colors.violet, color = colors.ink }: { size?: number; dot?: string; color?: string }) {
  // Le vrai logo vectoriel : point violet stable, point citron « en direct ».
  return <Wordmark height={size * 1.15} ink={color} dot1={dot} />;
}

const styles = StyleSheet.create({
  chip: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 6, borderRadius: radius.pill, paddingVertical: 4, paddingHorizontal: 9, minHeight: 24 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  chipText: { fontFamily: fonts.bold, fontSize: 12 },
  big: { height: 64, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  bigText: { fontFamily: fonts.display, fontSize: 22 },
  icon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
});

/** Barre de navigation flottante, deux onglets seulement : partir, et l'état du trafic. */
export function BottomNav({ active }: { active: 'aller' | 'trafic' }) {
  useI18n();
  const item = (key: 'aller' | 'trafic', label: string, href: '/' | '/trafic') => {
    const on = active === key;
    return (
      <Pressable
        key={key}
        accessibilityRole="tab"
        accessibilityState={{ selected: on }}
        onPress={() => { if (!on) router.replace(href); }}
        style={[navStyles.item, on && navStyles.itemOn]}
      >
        <Text style={[navStyles.text, on && navStyles.textOn]}>{label}</Text>
      </Pressable>
    );
  };
  return (
    <View pointerEvents="box-none" style={navStyles.wrap}>
      <View style={navStyles.bar} accessibilityRole="tablist">
        {item('aller', t('nav.go'), '/')}
        {item('trafic', t('nav.traffic'), '/trafic')}
      </View>
    </View>
  );
}

const navStyles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, bottom: 24, alignItems: 'center' },
  bar: { flexDirection: 'row', gap: 4, backgroundColor: colors.ink, borderRadius: radius.pill, padding: 6 },
  item: { height: 46, paddingHorizontal: 22, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  itemOn: { backgroundColor: colors.lime },
  text: { fontFamily: fonts.bold, fontSize: 16, color: '#FFFFFF' },
  textOn: { color: colors.ink },
});
