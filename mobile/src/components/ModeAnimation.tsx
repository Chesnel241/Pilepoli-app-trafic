import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, View } from 'react-native';
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';
import LottieView from 'lottie-react-native';
import { LOTTIE } from '../animations/registry';
import type { LegMode } from '../lib/types';
import { colors } from '../theme';

/**
 * Une petite animation par mode de transport : l'appli montre ce que tu prends.
 * Dessins originaux, vectoriels et légers (quelques formes, animées par le moteur natif :
 * aucun coût pour le reste de l'écran). Si un fichier Lottie est enregistré pour ce mode
 * dans animations/registry.ts, il est utilisé à la place.
 * « Réduire les animations » du système est respecté : l'image reste fixe.
 */
type Props = { mode: LegMode; size?: number; ink?: string; accent?: string; glass?: string; playing?: boolean };

export function ModeAnimation({ mode, size = 96, ink = colors.ink, accent = colors.lime, glass = '#FFFFFF', playing = true }: Props) {
  const reduce = useReduceMotion();
  const run = playing && !reduce;
  const lottie = LOTTIE[mode];
  if (lottie) {
    return <LottieView source={lottie as never} autoPlay={run} loop style={{ width: size, height: size }} />;
  }
  const k = size / 120;
  const p = { k, ink, accent, glass, run };
  return (
    <View style={{ width: size, height: size }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {mode === 'bus' ? <Bus {...p} />
        : mode === 'tram' ? <Tram {...p} />
        : mode === 'rer' || mode === 'train' ? <Train {...p} />
        : mode === 'cable' ? <Cable {...p} />
        : mode === 'boat' ? <Boat {...p} />
        : mode === 'walk' ? <Walk {...p} />
        : <Metro {...p} />}
    </View>
  );
}

type P = { k: number; ink: string; accent: string; glass: string; run: boolean };

function useReduceMotion() {
  const [v, setV] = useState(false);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setV).catch(() => null);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setV);
    return () => sub.remove();
  }, []);
  return v;
}

/** Boucle simple 0 → 1, pilotée par le moteur natif. */
function useLoop(run: boolean, duration: number, pingPong = false, easing = Easing.linear) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!run) { v.setValue(0); return; }
    const anim = pingPong
      ? Animated.loop(Animated.sequence([
          Animated.timing(v, { toValue: 1, duration, easing, useNativeDriver: true }),
          Animated.timing(v, { toValue: 0, duration, easing, useNativeDriver: true }),
        ]))
      : Animated.loop(Animated.timing(v, { toValue: 1, duration, easing, useNativeDriver: true }));
    anim.start();
    return () => anim.stop();
  }, [run, v, duration, pingPong]);
  return v;
}

/** Léger tremblement du véhicule en marche. */
function Bob({ k, run, children, amp = 1.5 }: { k: number; run: boolean; children: React.ReactNode; amp?: number }) {
  const v = useLoop(run, 320, true, Easing.inOut(Easing.quad));
  return (
    <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, -amp * k] }) }] }]}>
      {children}
    </Animated.View>
  );
}

/** Voie ferrée vue de face : rails fixes, traverses qui défilent vers toi. */
function Rails({ k, ink, run }: P) {
  const v = useLoop(run, 380);
  const gap = 9;
  return (
    <>
      <View style={{ position: 'absolute', left: 34 * k, top: 86 * k, width: 52 * k, height: 34 * k, overflow: 'hidden' }}>
        <Animated.View style={{ transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [-gap * k, 0] }) }] }}>
          <Svg width={52 * k} height={44 * k} viewBox="0 0 52 44">
            {[0, 1, 2, 3, 4].map((i) => <Rect key={i} x={4 - i} y={i * gap + 2} width={44 + 2 * i} height={3} rx={1.5} fill={ink} opacity={0.35} />)}
          </Svg>
        </Animated.View>
      </View>
      <Svg style={StyleSheet.absoluteFill} viewBox="0 0 120 120">
        <Line x1={44} y1={86} x2={30} y2={120} stroke={ink} strokeWidth={4} strokeLinecap="round" />
        <Line x1={76} y1={86} x2={90} y2={120} stroke={ink} strokeWidth={4} strokeLinecap="round" />
      </Svg>
    </>
  );
}

/** Route vue de face : la ligne centrale défile. */
function Road({ k, ink, run }: P) {
  const v = useLoop(run, 420);
  return (
    <>
      <Svg style={StyleSheet.absoluteFill} viewBox="0 0 120 120">
        <Line x1={34} y1={92} x2={18} y2={120} stroke={ink} strokeWidth={3} strokeLinecap="round" opacity={0.5} />
        <Line x1={86} y1={92} x2={102} y2={120} stroke={ink} strokeWidth={3} strokeLinecap="round" opacity={0.5} />
      </Svg>
      <View style={{ position: 'absolute', left: 57 * k, top: 92 * k, width: 6 * k, height: 28 * k, overflow: 'hidden' }}>
        <Animated.View style={{ transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [-14 * k, 0] }) }] }}>
          <Svg width={6 * k} height={42 * k} viewBox="0 0 6 42">
            {[0, 1, 2].map((i) => <Rect key={i} x={1} y={i * 14} width={4} height={7} rx={2} fill={ink} opacity={0.6} />)}
          </Svg>
        </Animated.View>
      </View>
    </>
  );
}

function Metro(p: P) {
  const { k, ink, accent, glass, run } = p;
  return (
    <>
      <Rails {...p} />
      <Bob k={k} run={run}>
        <Svg width="100%" height="100%" viewBox="0 0 120 120">
          <Rect x={30} y={14} width={60} height={72} rx={20} fill={ink} />
          <Rect x={46} y={19} width={28} height={5} rx={2.5} fill={accent} />
          <Rect x={38} y={29} width={44} height={26} rx={9} fill={glass} opacity={0.92} />
          <Circle cx={42} cy={67} r={5} fill={accent} />
          <Circle cx={78} cy={67} r={5} fill={accent} />
          <Rect x={52} y={64} width={16} height={6} rx={3} fill={glass} opacity={0.25} />
          <Rect x={38} y={78} width={44} height={5} rx={2.5} fill={glass} opacity={0.18} />
        </Svg>
      </Bob>
    </>
  );
}

function Train(p: P) {
  const { k, ink, accent, glass, run } = p;
  return (
    <>
      <Rails {...p} />
      <Bob k={k} run={run} amp={1}>
        <Svg width="100%" height="100%" viewBox="0 0 120 120">
          <Path d="M36 30 Q36 8 60 8 Q84 8 84 30 L86 80 Q86 86 80 86 L40 86 Q34 86 34 80 Z" fill={ink} />
          <Path d="M42 26 Q44 15 60 15 Q76 15 78 26 L80 46 L40 46 Z" fill={glass} opacity={0.92} />
          <Rect x={34} y={56} width={52} height={6} fill={accent} />
          <Circle cx={44} cy={72} r={4.5} fill={glass} />
          <Circle cx={76} cy={72} r={4.5} fill={glass} />
          <Rect x={54} y={68} width={12} height={8} rx={2} fill={glass} opacity={0.2} />
        </Svg>
      </Bob>
    </>
  );
}

function Tram(p: P) {
  const { k, ink, accent, glass, run } = p;
  return (
    <>
      <Svg style={StyleSheet.absoluteFill} viewBox="0 0 120 120">
        <Line x1={0} y1={6} x2={120} y2={6} stroke={ink} strokeWidth={2} opacity={0.5} />
      </Svg>
      <Rails {...p} />
      <Bob k={k} run={run} amp={1}>
        <Svg width="100%" height="100%" viewBox="0 0 120 120">
          <Path d="M50 22 L60 8 L70 22" stroke={ink} strokeWidth={3} fill="none" strokeLinejoin="round" />
          <Rect x={30} y={22} width={60} height={64} rx={26} fill={ink} />
          <Rect x={37} y={32} width={46} height={28} rx={12} fill={glass} opacity={0.92} />
          <Rect x={50} y={25} width={20} height={4} rx={2} fill={accent} />
          <Rect x={38} y={68} width={10} height={5} rx={2.5} fill={accent} />
          <Rect x={72} y={68} width={10} height={5} rx={2.5} fill={accent} />
        </Svg>
      </Bob>
    </>
  );
}

function Bus(p: P) {
  const { k, ink, accent, glass, run } = p;
  return (
    <>
      <Road {...p} />
      <Bob k={k} run={run} amp={2}>
        <Svg width="100%" height="100%" viewBox="0 0 120 120">
          <Rect x={30} y={12} width={60} height={70} rx={12} fill={ink} />
          <Rect x={24} y={24} width={6} height={12} rx={2} fill={ink} />
          <Rect x={90} y={24} width={6} height={12} rx={2} fill={ink} />
          <Rect x={42} y={16} width={36} height={6} rx={3} fill={accent} />
          <Rect x={36} y={26} width={48} height={30} rx={6} fill={glass} opacity={0.92} />
          <Rect x={38} y={64} width={12} height={7} rx={3} fill={accent} />
          <Rect x={70} y={64} width={12} height={7} rx={3} fill={accent} />
          <Rect x={52} y={66} width={16} height={5} rx={2} fill={glass} opacity={0.25} />
          <Rect x={34} y={80} width={12} height={10} rx={3} fill={ink} />
          <Rect x={74} y={80} width={12} height={10} rx={3} fill={ink} />
        </Svg>
      </Bob>
    </>
  );
}

function Cable({ ink, accent, glass, run }: P) {
  const v = useLoop(run, 1300, true, Easing.inOut(Easing.sin));
  return (
    <>
      <Svg style={StyleSheet.absoluteFill} viewBox="0 0 120 120">
        <Line x1={0} y1={22} x2={120} y2={10} stroke={ink} strokeWidth={2.5} strokeLinecap="round" />
      </Svg>
      {/* La cabine se balance autour de son point d'accroche, sur le câble. */}
      <Animated.View style={[StyleSheet.absoluteFill, {
        transformOrigin: '50% 13%',
        transform: [{ rotate: v.interpolate({ inputRange: [0, 1], outputRange: ['-4deg', '4deg'] }) }],
      }]}>
        <Svg width="100%" height="100%" viewBox="0 0 120 120">
          <Circle cx={60} cy={16} r={4} fill={ink} />
          <Line x1={60} y1={16} x2={60} y2={40} stroke={ink} strokeWidth={3} />
          <Rect x={34} y={40} width={52} height={50} rx={12} fill={ink} />
          <Rect x={40} y={47} width={18} height={22} rx={5} fill={glass} opacity={0.92} />
          <Rect x={62} y={47} width={18} height={22} rx={5} fill={glass} opacity={0.92} />
          <Rect x={40} y={78} width={40} height={4} rx={2} fill={accent} />
        </Svg>
      </Animated.View>
    </>
  );
}

function Boat({ k, ink, accent, glass, run }: P) {
  const wave = useLoop(run, 1600);
  return (
    <>
      <Bob k={k} run={run} amp={2.5}>
        <Svg width="100%" height="100%" viewBox="0 0 120 120">
          <Rect x={48} y={30} width={26} height={22} rx={5} fill={ink} />
          <Rect x={52} y={35} width={8} height={7} rx={2} fill={glass} opacity={0.92} />
          <Rect x={62} y={35} width={8} height={7} rx={2} fill={glass} opacity={0.92} />
          <Line x1={58} y1={30} x2={58} y2={14} stroke={ink} strokeWidth={2.5} />
          <Path d="M58 14 L72 18 L58 22 Z" fill={accent} />
          <Path d="M24 54 L96 54 L86 78 Q84 82 80 82 L40 82 Q36 82 34 78 Z" fill={ink} />
          <Rect x={30} y={60} width={60} height={4} fill={accent} />
        </Svg>
      </Bob>
      <View style={{ position: 'absolute', left: 0, top: 80 * k, width: 120 * k, height: 24 * k, overflow: 'hidden' }}>
        <Animated.View style={{ transform: [{ translateX: wave.interpolate({ inputRange: [0, 1], outputRange: [0, -30 * k] }) }] }}>
          <Svg width={180 * k} height={24 * k} viewBox="0 0 180 24">
            <Path d="M0 8 Q7.5 2 15 8 T30 8 T45 8 T60 8 T75 8 T90 8 T105 8 T120 8 T135 8 T150 8 T165 8 T180 8" stroke={ink} strokeWidth={3} fill="none" opacity={0.5} />
            <Path d="M0 18 Q7.5 12 15 18 T30 18 T45 18 T60 18 T75 18 T90 18 T105 18 T120 18 T135 18 T150 18 T165 18 T180 18" stroke={ink} strokeWidth={3} fill="none" opacity={0.25} />
          </Svg>
        </Animated.View>
      </View>
    </>
  );
}

function Walk({ k, ink, accent, run }: P) {
  const v = useLoop(run, 360, true, Easing.inOut(Easing.quad));
  const leg = (dir: 1 | -1, color: string) => (
    <Animated.View style={{
      position: 'absolute', left: 56 * k, top: 64 * k, width: 8 * k, height: 34 * k, borderRadius: 4 * k, backgroundColor: color,
      transformOrigin: '50% 0%',
      transform: [{ rotate: v.interpolate({ inputRange: [0, 1], outputRange: [`${-22 * dir}deg`, `${22 * dir}deg`] }) }],
    }} />
  );
  return (
    <>
      {leg(-1, ink)}
      <Bob k={k} run={run} amp={1.5}>
        <Svg width="100%" height="100%" viewBox="0 0 120 120">
          <Circle cx={60} cy={24} r={11} fill={ink} />
          <Rect x={52} y={38} width={16} height={30} rx={8} fill={ink} />
          <Rect x={52} y={44} width={16} height={6} fill={accent} />
        </Svg>
      </Bob>
      {leg(1, ink)}
      <View style={{ position: 'absolute', left: 30 * k, right: 30 * k, top: 104 * k, height: 3 * k, borderRadius: 2, backgroundColor: ink, opacity: 0.25 }} />
    </>
  );
}
