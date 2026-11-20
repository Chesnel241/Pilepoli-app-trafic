import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, AppState, Easing, Pressable, StyleSheet, Text as FixedText, View, type LayoutChangeEvent } from 'react-native';
import { useFocusEffect } from 'expo-router';
import Svg, { Circle, G } from 'react-native-svg';
import { LineBadge } from './ui';
import { lineName } from '../lib/disruption';
import { LEVEL, type ModeKey } from '../lib/lines';
import { t } from '../lib/i18n';
import type { TrafficLevel } from '../lib/types';
import { colors, fonts } from '../theme';

export interface CloudLine {
  key: string;
  code: string;
  color: string;
  textColor: string;
  mode: ModeKey;
  /** Absent : on ne sait pas encore (pas de données), la ligne reste neutre. */
  level?: TrafficLevel;
}

/** Une ligne « pose problème » seulement si l'info en cours le dit. Info et travaux à venir restent calmes. */
export const isTroubled = (lv?: TrafficLevel) => lv === 'perturbe' || lv === 'interrompu' || lv === 'travaux';

/**
 * Le nuage de lignes : des trèfles imbriqués en nid d'abeille.
 * Les lignes qui roulent sont des trèfles gris, immobiles. Celles qui ont un souci prennent
 * la couleur de l'état, écrivent le mot (jamais la couleur seule) et respirent doucement :
 * un halo pour « perturbé », un halo plus sombre pour « interrompu », un petit balancement pour « travaux ».
 * Les animations s'arrêtent hors de l'écran, en arrière-plan et si « réduire les animations » est activé.
 */
export function LineCloud({ lines, onOpen, cols = 4, calmFill = colors.soft, showWord = true }: {
  lines: CloudLine[];
  onOpen: (l: CloudLine) => void;
  cols?: number;
  calmFill?: string;
  showWord?: boolean;
}) {
  const [width, setWidth] = useState(0);
  const live = useMotionAllowed();
  const onLayout = (e: LayoutChangeEvent) => setWidth(Math.round(e.nativeEvent.layout.width));

  // Rangées alternées : cols, puis cols - 1 décalée d'une demi-case (comme les alvéoles).
  const rows: CloudLine[][] = [];
  for (let i = 0, r = 0; i < lines.length; r++) {
    const n = r % 2 === 0 ? cols : Math.max(1, cols - 1);
    rows.push(lines.slice(i, i + n));
    i += n;
  }
  const cell = width / cols;
  const size = cell * 0.92; // un mince blanc entre trèfles voisins, comme sur un vrai nuage
  const step = cell * 0.8;

  return (
    <View onLayout={onLayout} style={{ width: '100%' }}>
      {width > 0 ? rows.map((row, r) => (
        <View key={r} style={[s.row, { height: size, marginTop: r === 0 ? 0 : step - size, paddingLeft: r % 2 ? cell / 2 : 0 }]}>
          {row.map((l) => (
            <View key={l.key} style={{ width: cell, alignItems: 'center' }}>
              <Clover line={l} size={size} live={live} calmFill={calmFill} showWord={showWord} onPress={() => onOpen(l)} />
            </View>
          ))}
        </View>
      )) : <View style={{ height: 80 }} />}
    </View>
  );
}

/** Quatre lobes en diagonale : un trèfle avec une encoche douce au milieu de chaque côté. */
export function Shape({ fill, size }: { fill: string; size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <G fill={fill}>
        <Circle cx={31} cy={31} r={31} />
        <Circle cx={69} cy={31} r={31} />
        <Circle cx={31} cy={69} r={31} />
        <Circle cx={69} cy={69} r={31} />
      </G>
    </Svg>
  );
}

function Clover({ line, size, live, calmFill, showWord, onPress }: {
  line: CloudLine; size: number; live: boolean; calmFill: string; showWord: boolean; onPress: () => void;
}) {
  const level = line.level;
  const troubled = isTroubled(level);
  const lv = level ? LEVEL[level] : LEVEL.ok;
  const fill = troubled ? lv.bg : calmFill;
  const badge = Math.round(size * (showWord && troubled ? 0.36 : 0.42));
  const wordColor = level === 'interrompu' ? '#FFFFFF' : lv.fg;

  const pulse = useRef(new Animated.Value(0)).current;
  const press = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    pulse.stopAnimation();
    pulse.setValue(0);
    if (!troubled || !live) return;
    // Un décalage propre à chaque ligne : les trèfles ne battent jamais tous ensemble.
    const delay = hash(line.key) % 1200;
    const duration = level === 'travaux' ? 2600 : level === 'interrompu' ? 1800 : 2300;
    const loop = Animated.loop(Animated.sequence([
      Animated.delay(delay),
      Animated.timing(pulse, { toValue: 1, duration, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0, duration: 0, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [troubled, live, level, line.key, pulse]);

  // Perturbé / interrompu : le halo s'élargit et s'efface, le trèfle respire à peine.
  const haloScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.22] });
  const haloOpacity = pulse.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 0.5, 0] });
  const breath = pulse.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 1.035, 1] });
  // Travaux : un petit balancement de panneau de chantier, deux allers-retours puis repos.
  const wobble = pulse.interpolate({ inputRange: [0, 0.15, 0.3, 0.45, 0.6, 1], outputRange: ['0deg', '-4deg', '4deg', '-2deg', '0deg', '0deg'] });

  const halo = level === 'interrompu' ? colors.ink : lv.dot;
  const moving = troubled && live;
  const transform = level === 'travaux'
    ? [{ scale: press }, { rotate: moving ? wobble : '0deg' }]
    : [{ scale: press }, { scale: moving ? breath : 1 }];

  const pressTo = (v: number) => Animated.spring(press, { toValue: v, stiffness: 320, damping: 20, useNativeDriver: true }).start();

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => pressTo(0.92)}
      onPressOut={() => pressTo(1)}
      accessibilityRole="button"
      accessibilityLabel={`${lineName(line.code, line.mode)} : ${level ? t(`lvl.${level}`) : t('traffic.looking')}`}
      style={{ width: size, height: size }}
    >
      {troubled && level !== 'travaux' ? (
        moving ? (
          <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: haloOpacity, transform: [{ scale: haloScale }] }]}>
            <Shape fill={halo} size={size} />
          </Animated.View>
        ) : (
          // Animations coupées : un liseré fixe garde l'alerte visible.
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: 0.35, transform: [{ scale: 1.1 }] }]}>
            <Shape fill={halo} size={size} />
          </View>
        )
      ) : null}
      <Animated.View style={[StyleSheet.absoluteFill, s.center, { transform }]}>
        <View style={StyleSheet.absoluteFill}><Shape fill={fill} size={size} /></View>
        <LineBadge code={line.code} color={line.color} textColor={line.textColor} size={badge} round={line.mode === 'metro'} />
        {showWord && troubled && level ? (
          <FixedText allowFontScaling={false} numberOfLines={1} style={[s.word, { color: wordColor, fontSize: Math.max(9, size * 0.12), maxWidth: size * 0.82 }]}>
            {t(`lvl.${level}`)}
          </FixedText>
        ) : null}
      </Animated.View>
    </Pressable>
  );
}

/** Animer seulement quand ça sert : écran visible, appli au premier plan, animations autorisées. */
function useMotionAllowed() {
  const [focused, setFocused] = useState(true);
  const [active, setActive] = useState(AppState.currentState === 'active');
  const [reduce, setReduce] = useState(false);
  useFocusEffect(useCallback(() => { setFocused(true); return () => setFocused(false); }, []));
  useEffect(() => {
    const a = AppState.addEventListener('change', (st) => setActive(st === 'active'));
    AccessibilityInfo.isReduceMotionEnabled().then(setReduce).catch(() => null);
    const r = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
    return () => { a.remove(); r.remove(); };
  }, []);
  return focused && active && !reduce;
}

function hash(str: string) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}

const s = StyleSheet.create({
  row: { flexDirection: 'row' },
  center: { alignItems: 'center', justifyContent: 'center', gap: 2 },
  word: { fontFamily: fonts.black, letterSpacing: -0.2 },
});
