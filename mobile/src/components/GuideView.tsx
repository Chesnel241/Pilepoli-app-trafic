import { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View } from 'react-native';
import { Text } from './Text';
import type { GuideState } from '../lib/guide';
import type { GuideStop } from '../lib/trip';
import { IconWalk } from './icons';
import { colors, fonts } from '../theme';
import { isExitTip } from '../lib/i18n';
import { useI18n } from '../lib/settings';
import { Text as FixedText } from 'react-native';

/**
 * Le grand affichage pas à pas : une seule consigne, en très gros, lisible de loin.
 * Pensé pour tout le monde, y compris les personnes âgées ou malvoyantes :
 * fort contraste, un chiffre géant, la lecture à voix haute en un tap.
 */
type Theme = { bg: string; fg: string; sub: string; chipBg: string; chipFg: string };
const THEMES: Record<GuideState['phase'], Theme> = {
  before: { bg: colors.bg, fg: colors.ink, sub: '#3A3D46', chipBg: colors.soft, chipFg: colors.ink },
  at: { bg: colors.bg, fg: colors.ink, sub: '#3A3D46', chipBg: colors.soft, chipFg: colors.ink },
  moving: { bg: colors.violet, fg: '#FFFFFF', sub: colors.violetSoft, chipBg: colors.violetDark, chipFg: '#FFFFFF' },
  walking: { bg: colors.lime, fg: colors.ink, sub: '#2B2E14', chipBg: '#FFFFFF', chipFg: colors.ink },
  arrived: { bg: colors.lime, fg: colors.ink, sub: '#2B2E14', chipBg: '#FFFFFF', chipFg: colors.ink },
};

export function GuideView({ state, stops, voiceOn, onVoice }: {
  state: GuideState; stops: GuideStop[]; voiceOn: boolean; onVoice: () => void;
}) {
  const { t: tr } = useI18n();
  const t = THEMES[state.phase];
  const c = state.card;
  const b = state.big;
  const target = stops[state.signIdx];
  const tags = target?.tags ?? [];

  // Le chiffre « respire » doucement quand il ne reste qu'une minute ou moins.
  const pulse = useRef(new Animated.Value(1)).current;
  const urgent = b.minutes !== null && b.minutes <= 1;
  useEffect(() => {
    if (!urgent) { pulse.setValue(1); return; }
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1.06, duration: 600, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 1, duration: 600, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [urgent, pulse]);

  return (
    <View style={[s.wrap, { backgroundColor: t.bg }]} accessibilityLiveRegion="polite">
      <View style={s.lineRow}>
        {state.phase === 'walking' ? (
          <View style={[s.lineBadge, { backgroundColor: colors.ink }]}><IconWalk size={34} color={colors.lime} /></View>
        ) : (
          <View style={[s.lineBadge, { backgroundColor: c.badgeColor }]}>
            <Text style={[s.lineBadgeText, { color: c.badgeText }]}>{c.badge}</Text>
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={[s.kicker, { color: t.sub }]} numberOfLines={1}>{c.kicker}</Text>
          {b.direction ? <Text style={[s.direction, { color: t.fg }]} numberOfLines={2}>{tr('guide.direction', { dir: b.direction })}</Text> : null}
        </View>
      </View>

      <Text style={[s.title, { color: t.fg }]} accessibilityRole="header">{c.title}</Text>
      {state.phase === 'moving' && b.stopsLeft === 1 && b.target ? (
        <Text style={[s.targetLine, { color: t.fg }]}>{tr('guide.getOffAt', { name: b.target })}</Text>
      ) : null}

      <Animated.View style={[s.bigRow, { transform: [{ scale: pulse }] }]}>
        {b.minutes === null ? (
          <FixedText allowFontScaling={false} style={[s.now, { color: t.fg }]}>{tr('guide.now')}</FixedText>
        ) : (
          <>
            {/* Le chiffre géant garde sa taille : il est déjà fait pour être lu de loin. */}
            <FixedText allowFontScaling={false} style={[s.bigNum, { color: state.phase === 'moving' ? colors.lime : t.fg }]}>{b.minutes}</FixedText>
            <View style={{ paddingBottom: 18 }}>
              <Text style={[s.bigUnit, { color: state.phase === 'moving' ? colors.lime : t.fg }]}>{tr('common.min')}</Text>
              <Text style={[s.bigLabel, { color: t.sub }]}>{b.minutesLabel}</Text>
            </View>
          </>
        )}
      </Animated.View>

      <View style={s.chips}>
        {b.stopsLeft ? (
          <View style={[s.chip, { backgroundColor: t.chipBg }]}>
            <Text style={[s.chipBig, { color: t.chipFg }]}>{b.stopsLeft}</Text>
            <Text style={[s.chipText, { color: t.chipFg }]}>{b.stopsLeft > 1 ? tr('guide.stopsWord') : tr('guide.stop')}</Text>
          </View>
        ) : null}
        {b.nextStop && state.phase === 'moving' ? (
          <View style={[s.chip, { backgroundColor: t.chipBg, flexShrink: 1 }]}>
            <Text style={[s.chipText, { color: t.chipFg }]} numberOfLines={1}>{tr('guide.next', { name: b.nextStop })}</Text>
          </View>
        ) : null}
        {tags.map((tag) => (
          <View key={tag} style={[s.chip, isExitTip(tag) ? s.exitChip : { backgroundColor: t.chipBg }]}>
            <Text style={[s.chipText, { color: isExitTip(tag) ? colors.lime : t.chipFg }]}>{tag}</Text>
          </View>
        ))}
      </View>

      <View style={{ flex: 1 }} />

      <View style={[s.bar, { backgroundColor: state.phase === 'moving' ? colors.violetDark : 'rgba(14,15,18,0.12)' }]}>
        <View style={[s.barFill, { width: `${Math.round(c.pct * 100)}%`, backgroundColor: state.phase === 'moving' ? colors.lime : colors.ink }]} />
      </View>

      <Pressable
        onPress={onVoice}
        accessibilityRole="button"
        accessibilityLabel={voiceOn ? tr('guide.voiceOff') : tr('guide.listen')}
        style={({ pressed }) => [s.voice, { backgroundColor: state.phase === 'moving' ? '#FFFFFF' : colors.ink, opacity: pressed ? 0.85 : 1 }]}
      >
        <Text style={[s.voiceText, { color: state.phase === 'moving' ? colors.ink : '#FFFFFF' }]}>
          {voiceOn ? tr('guide.voiceOn') : tr('guide.listen')}
        </Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, borderRadius: 32, padding: 22, gap: 18 },
  lineRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  lineBadge: { width: 64, height: 64, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  lineBadgeText: { fontFamily: fonts.display, fontSize: 34 },
  kicker: { fontFamily: fonts.bold, fontSize: 16 },
  direction: { fontFamily: fonts.bold, fontSize: 20, lineHeight: 24 },
  title: { fontFamily: fonts.display, fontSize: 46, lineHeight: 48, letterSpacing: -1 },
  targetLine: { fontFamily: fonts.display, fontSize: 28, lineHeight: 32, marginTop: -8 },
  bigRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, alignSelf: 'flex-start' },
  bigNum: { fontFamily: fonts.display, fontSize: 132, lineHeight: 132, letterSpacing: -5 },
  bigUnit: { fontFamily: fonts.display, fontSize: 36, lineHeight: 38 },
  bigLabel: { fontFamily: fonts.bold, fontSize: 16 },
  now: { fontFamily: fonts.display, fontSize: 64, lineHeight: 68, letterSpacing: -2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'baseline', gap: 6, borderRadius: 16, paddingVertical: 10, paddingHorizontal: 14 },
  chipBig: { fontFamily: fonts.display, fontSize: 26 },
  chipText: { fontFamily: fonts.bold, fontSize: 17 },
  exitChip: { backgroundColor: colors.ink },
  bar: { height: 8, borderRadius: 4, overflow: 'hidden' },
  barFill: { height: 8, borderRadius: 4 },
  voice: { height: 64, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  voiceText: { fontFamily: fonts.black, fontSize: 18 },
});
