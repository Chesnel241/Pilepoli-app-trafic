import { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import * as Speech from 'expo-speech';
import { Text } from './Text';
import { ModeAnimation } from './ModeAnimation';
import { mapLook } from './MapBits';
import { angleDiff, pointAt, type LonLat } from '../lib/geo';
import { bendOf, roundWalk, walkMinutes, walkStatus, type TurnKind, type WalkPlan, type WalkStatus } from '../lib/walk';
import type { Live } from '../lib/location';
import type { LegMode } from '../lib/types';
import { hhmm } from '../lib/trip';
import { localeTag, t } from '../lib/i18n';
import { useSettings } from '../lib/settings';
import { colors, fonts, radius } from '../theme';

/**
 * GPS à pied, concept « la flèche qui se plie » :
 * une tige calme qui pointe où marcher ; à l'approche d'un virage, sa tête se plie du côté où tourner
 * pendant qu'un anneau violet se remplit ; au virage, tout passe au citron et le téléphone vibre
 * (2 coups = gauche, 3 coups = droite). On comprend sans lire.
 */
const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const ll = (p: LonLat) => ({ longitude: p[0], latitude: p[1] });
const short = (n: string) => n.replace(/\s*\(.*\)$/, '').trim();
const fmtDist = (m: number) => (m >= 1000 ? { v: (m / 1000).toFixed(1).replace('.', ','), u: 'km' } : { v: String(roundWalk(m)), u: 'm' });

type Mode = 'normal' | 'near' | 'turn' | 'off' | 'lost' | 'arrived';

function useReduceMotion() {
  const [v, setV] = useState(false);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setV).catch(() => null);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setV);
    return () => sub.remove();
  }, []);
  return v;
}

export function WalkNav({ plan, live, trainAt, nextMode, compact = false, onStatus }: {
  plan: WalkPlan; live: Live; trainAt?: number; nextMode?: LegMode; compact?: boolean; onStatus?: (s: WalkStatus | null) => void;
}) {
  const { settings } = useSettings();
  const big = settings.textScale > 1;
  const reduce = useReduceMotion();
  const [voice, setVoice] = useState(settings.voiceAuto);

  const prevAlong = useRef(0);
  const status = useMemo(() => {
    if (!live.fix) return null;
    const s = walkStatus(plan, live.fix.p, live.fix.accuracy, prevAlong.current);
    prevAlong.current = s.along;
    return s;
  }, [plan, live.fix]);
  useEffect(() => { onStatus?.(status); }, [status?.along, status?.arrived, status?.onRoute]);

  // Hors chemin seulement après plusieurs positions de suite (pas sur un saut du GPS).
  const offCount = useRef(0);
  const [off, setOff] = useState(false);
  useEffect(() => {
    if (!status) return;
    offCount.current = status.onRoute ? 0 : offCount.current + 1;
    setOff(offCount.current >= 3);
  }, [status?.along, status?.offset]);

  const lost = live.gps === 'granted' && (!live.fix || Date.now() - live.fix.at > 12_000);
  const approx = !!live.fix && (live.fix.accuracy ?? 0) > 30;
  const toTurn = status?.next?.inMeters ?? Infinity;
  const arrived = !!status?.arrived;
  const mode: Mode = arrived ? 'arrived' : lost ? 'lost' : off ? 'off' : toTurn < 8 ? 'turn' : toTurn < 30 ? 'near' : 'normal';
  const p = status?.next && toTurn < 30 ? Math.max(0, Math.min(1, 1 - toTurn / 30)) : 0;
  const bend = status?.next ? bendOf[status.next.kind] : 0;
  const target = status ? (live.heading !== null ? angleDiff(status.heading, live.heading) : status.heading) : 0;

  const remaining = status?.remaining ?? plan.length;
  const mins = walkMinutes(remaining);
  const arriveAt = Date.now() + mins * 60_000;
  const slack = trainAt ? Math.floor((trainAt - arriveAt) / 60_000) : null;

  // ---- Haptique et voix : au plus un motif toutes les 2 s, jamais de répétition. ----
  const lastBuzz = useRef(0);
  const done = useRef(new Set<string>());
  const say = (text: string) => { if (!voice) return; Speech.stop().catch(() => null); Speech.speak(text, { language: localeTag(), rate: 1 }); };
  const buzz = async (kind: 'light' | 'medium' | 'left' | 'right' | 'warn' | 'success') => {
    const now = Date.now();
    if (now - lastBuzz.current < 2000) return;
    lastBuzz.current = now;
    const tap = (s: Haptics.ImpactFeedbackStyle) => Haptics.impactAsync(s).catch(() => null);
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
    if (kind === 'light') tap(Haptics.ImpactFeedbackStyle.Light);
    else if (kind === 'medium') tap(Haptics.ImpactFeedbackStyle.Medium);
    else if (kind === 'left') { tap(Haptics.ImpactFeedbackStyle.Medium); await wait(120); tap(Haptics.ImpactFeedbackStyle.Medium); }
    else if (kind === 'right') { for (let i = 0; i < 3; i++) { tap(Haptics.ImpactFeedbackStyle.Light); await wait(120); } }
    else if (kind === 'warn') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => null);
    else Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => null);
  };
  useEffect(() => {
    const n = status?.next;
    const id = n ? `${Math.round(n.along)}` : '';
    const once = (key: string, f: () => void) => { if (!done.current.has(key)) { done.current.add(key); f(); } };
    if (arrived) once('arrived', () => { buzz('success'); say(t('walk.vArrived', { name: short(plan.to) })); });
    else if (off) once(`off-${Math.round(status?.along ?? 0)}`, () => { buzz('warn'); say(t('walk.vOff')); });
    else if (n) {
      const kindTxt = t(`walk.${n.kind}`).toLowerCase();
      if (toTurn <= 40) once(`v40-${id}`, () => say(t('walk.vIn', { n: roundWalk(toTurn), kind: kindTxt, street: n.name ? `, ${n.name}` : '' })));
      if (toTurn <= 30) once(`h30-${id}`, () => buzz('light'));
      if (toTurn <= 10) once(`h10-${id}`, () => buzz('medium'));
      if (toTurn < 8) once(`turn-${id}`, () => { buzz(n.kind === 'uturn' ? 'warn' : n.angle < 0 ? 'left' : 'right'); say(t('walk.vNow', { kind: t(`walk.${n.kind}`) })); });
    }
  }, [arrived, off, toTurn, status?.next?.along]);
  // Retour sur le chemin après un écart : petit tap de confirmation.
  const wasOff = useRef(false);
  useEffect(() => { if (wasOff.current && !off) buzz('light'); wasOff.current = off; }, [off]);
  useEffect(() => () => { Speech.stop().catch(() => null); }, []);

  // ---- Textes de la consigne ----
  const start = (status?.along ?? 0) < 20 && !status?.next;
  const dist = fmtDist(status?.next ? toTurn : remaining);
  const head =
    mode === 'arrived' ? { big: t('walk.tyes'), line: short(plan.to), sub: trainAt ? t('walk.trainAt', { time: hhmm(new Date(trainAt).toISOString()) }) : '' }
    : mode === 'off' ? { big: t('walk.oops'), line: t('walk.notThisWay'), sub: '' }
    : mode === 'lost' ? { big: '?', line: t('walk.gpsLost'), sub: '' }
    : mode === 'turn' ? { big: t('walk.now'), line: t(`walk.${status!.next!.kind}`), sub: status!.next!.name }
    : status?.next ? { big: `${approx ? '≈ ' : ''}${dist.v}`, unit: dist.u, line: t(`walk.${status.next.kind}`), sub: status.next.name ? t('walk.onto', { name: status.next.name }) : '' }
    : { big: `${approx ? '≈ ' : ''}${dist.v}`, unit: dist.u, line: start ? t('walk.start') : t('walk.straight'), sub: start ? t('walk.towards', { name: short(plan.to) }) : status?.street ? t('walk.onto', { name: status.street }) : t('walk.until', { name: short(plan.to) }) };
  const textKey = `${mode === 'turn' || mode === 'near' || mode === 'normal' ? `n${Math.round(status?.next?.along ?? -1)}` : mode}`;

  // Un seul bandeau, par priorité : hors chemin, GPS perdu, retard, GPS approximatif.
  const banner = off ? { text: t('walk.recalc'), dark: false }
    : lost ? { text: t('walk.gpsLostSub'), dark: false }
    : slack !== null && slack < 0 && !arrived ? { text: t('walk.lateBanner', { time: hhmm(new Date(trainAt!).toISOString()) }), dark: false }
    : approx ? { text: t('walk.gpsApprox'), dark: true } : null;

  return (
    <View style={[s.wrap, compact && { gap: 8 }]}>
      <ConsignCard mode={mode} big={big} reduce={reduce} textKey={textKey} head={head}
        after={mode !== 'arrived' && status?.after ? t('walk.puis', { kind: t(`walk.${status.after.kind}`).toLowerCase() }) : undefined}
        afterKind={status?.after?.kind}
        compass={<Compass rotation={target} bend={bend} p={p} mode={mode} big={big} reduce={reduce}
          onPress={() => setVoice((v) => !v)} voice={voice} />} />

      {banner ? <Banner text={banner.text} dark={banner.dark} reduce={reduce} /> : null}

      <FollowMap plan={plan} live={live} along={status?.along ?? 0} nearTurn={toTurn < 30} turnAlong={status?.next?.along} stopped={(live.fix?.speed ?? 1) < 0.3}
        reduce={reduce} arrived={arrived} nextMode={nextMode} close={remaining < 50} />

      <View style={s.strip}>
        <View style={s.stripRow}>
          <Text style={s.stripMain} numberOfLines={1}>{short(plan.to)}</Text>
          <Text style={s.stripMain}>{mins} {t('common.min')}</Text>
        </View>
        {!big ? <Text style={s.stripSub}>{t('walk.arrivalAt', { m: `${fmtDist(remaining).v} ${fmtDist(remaining).u}`, time: hhmm(new Date(arriveAt).toISOString()) })}</Text> : null}
        {slack !== null && !arrived ? <SlackPill slack={slack} reduce={reduce} /> : null}
      </View>
    </View>
  );
}

/* ---------------------------------------------------------------- Carte consigne */

function ConsignCard({ mode, big, reduce, textKey, head, after, afterKind, compass }: {
  mode: Mode; big: boolean; reduce: boolean; textKey: string;
  head: { big: string; unit?: string; line: string; sub: string }; after?: string; afterKind?: TurnKind; compass: React.ReactNode;
}) {
  // Calques de couleur : citron au virage et à l'arrivée, violet hors chemin (fondus, moteur natif).
  const lime = useRef(new Animated.Value(0)).current;
  const violet = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const isLime = mode === 'turn' || mode === 'arrived';
    Animated.timing(lime, { toValue: isLime ? 1 : 0, duration: isLime ? 180 : reduce ? 150 : 400, delay: isLime ? 0 : 300, useNativeDriver: true }).start();
    Animated.timing(violet, { toValue: mode === 'off' ? 1 : 0, duration: 200, useNativeDriver: true }).start();
  }, [mode]);

  // Transition entre deux consignes : l'ancienne monte et s'efface, la nouvelle arrive avec un léger rebond.
  const [shown, setShown] = useState(head);
  const [key, setKey] = useState(textKey);
  const ty = useRef(new Animated.Value(0)).current;
  const op = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (textKey === key) { setShown(head); return; }
    if (reduce) { setKey(textKey); setShown(head); return; }
    Animated.parallel([
      Animated.timing(ty, { toValue: -24, duration: 160, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      Animated.timing(op, { toValue: 0, duration: 160, useNativeDriver: true }),
    ]).start(() => {
      setKey(textKey); setShown(head); ty.setValue(24);
      Animated.parallel([
        Animated.timing(ty, { toValue: 0, duration: 220, easing: Easing.out(Easing.back(1.4)), useNativeDriver: true }),
        Animated.timing(op, { toValue: 1, duration: 220, useNativeDriver: true }),
      ]).start();
    });
  }, [textKey, head.big, head.line, head.sub]);

  const onLight = mode === 'turn' || mode === 'arrived';
  const fg = onLight ? colors.ink : '#FFFFFF';
  return (
    <View style={[s.card, big && { minHeight: 236 }]} accessibilityLiveRegion="polite" accessibilityLabel={`${shown.big} ${shown.unit ?? ''} ${shown.line} ${shown.sub}`}>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: colors.violet, opacity: violet }]} />
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: colors.lime, opacity: lime }]} />
      {compass}
      <Animated.View style={{ flex: 1, gap: 2, transform: [{ translateY: ty }], opacity: op }}>
        <Text style={[s.big, big && s.bigXL, { color: fg }, mode === 'turn' && { fontSize: big ? 46 : 38, lineHeight: big ? 50 : 42 }]} numberOfLines={1} adjustsFontSizeToFit>
          {shown.big}{shown.unit ? <Text style={[s.unit, { color: fg }]}> {shown.unit}</Text> : null}
        </Text>
        <Text style={[s.line, big && { fontSize: 28, lineHeight: 32 }, { color: fg }]} numberOfLines={2}>{shown.line}</Text>
        {!big && shown.sub ? <Text style={[s.sub, { color: onLight ? 'rgba(14,15,18,0.7)' : 'rgba(242,242,245,0.6)' }]} numberOfLines={1}>{shown.sub}</Text> : null}
        {after && !big ? (
          <View style={[s.puis, onLight && { backgroundColor: 'rgba(14,15,18,0.1)' }]}>
            {afterKind ? <MiniArrow kind={afterKind} color={fg} /> : null}
            <Text style={[s.puisText, { color: fg }]}>{after}</Text>
          </View>
        ) : null}
      </Animated.View>
    </View>
  );
}

function MiniArrow({ kind, color }: { kind: TurnKind; color: string }) {
  return (
    <View style={{ transform: [{ rotate: `${bendOf[kind]}deg` }] }}>
      <Svg width={14} height={14} viewBox="0 0 24 24"><Path d="M12 3 L19 12 H14.5 V21 H9.5 V12 H5 Z" fill={color} /></Svg>
    </View>
  );
}

/* ---------------------------------------------------------------- Boussole et flèche qui se plie */

function Compass({ rotation, bend, p, mode, big, reduce, onPress, voice }: {
  rotation: number; bend: number; p: number; mode: Mode; big: boolean; reduce: boolean; onPress: () => void; voice: boolean;
}) {
  const D = big ? 136 : 112;
  const RING = D + 16;
  const r = RING / 2 - 4;
  const C = 2 * Math.PI * r;

  // Rotation globale : chemin le plus court, zone morte de 4°, ressort doux.
  const rot = useRef(new Animated.Value(0)).current;
  const acc = useRef(0);
  useEffect(() => {
    if (mode === 'lost' || mode === 'arrived') return;
    const d = angleDiff(rotation, acc.current);
    if (Math.abs(d) < 4) return;
    acc.current += d;
    if (reduce) Animated.timing(rot, { toValue: acc.current, duration: 150, useNativeDriver: true }).start();
    else Animated.spring(rot, { toValue: acc.current, stiffness: 120, damping: 18, mass: 1, useNativeDriver: true }).start();
  }, [rotation, mode]);

  // La tête se plie vers le virage, proportionnellement à la proximité.
  const headRot = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const to = mode === 'arrived' ? 90 : bend * p;
    Animated.timing(headRot, { toValue: to, duration: mode === 'arrived' ? 300 : 250, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [bend, p, mode]);

  // Anneau de rapprochement (0 → plein à l'arrivée au virage).
  const ring = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(ring, { toValue: mode === 'arrived' ? 1 : p, duration: 250, easing: Easing.linear, useNativeDriver: false }).start();
  }, [p, mode]);

  // Battement à 10 m, tremblement hors chemin.
  const beat = useRef(new Animated.Value(1)).current;
  const shake = useRef(new Animated.Value(0)).current;
  const beaten = useRef(false);
  useEffect(() => {
    if (p >= 2 / 3 && !beaten.current && !reduce) {
      beaten.current = true;
      Animated.sequence([
        Animated.timing(beat, { toValue: 1.08, duration: 120, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(beat, { toValue: 1, duration: 120, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      ]).start();
    }
    if (p === 0) beaten.current = false;
  }, [p]);
  useEffect(() => {
    if (mode !== 'off' || reduce) return;
    Animated.sequence([-6, 6, -4, 0].map((v) => Animated.timing(shake, { toValue: v, duration: 60, useNativeDriver: true }))).start();
  }, [mode]);

  // Arrivée : la flèche devient une coche, et des points s'envolent.
  const check = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(check, { toValue: mode === 'arrived' ? 1 : 0, duration: 300, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [mode]);

  const discColor = mode === 'turn' || mode === 'arrived' ? colors.ink : mode === 'lost' ? 'rgba(242,242,245,0.2)' : colors.lime;
  const arrowColor = mode === 'turn' || mode === 'arrived' ? '#FFFFFF' : colors.ink;
  const spin = rot.interpolate({ inputRange: [-36000, 36000], outputRange: ['-36000deg', '36000deg'] });
  const bendDeg = headRot.interpolate({ inputRange: [-180, 180], outputRange: ['-180deg', '180deg'] });
  const stemRot = check.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '-45deg'] });
  const stemScale = check.interpolate({ inputRange: [0, 1], outputRange: [1, 0.6] });

  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={voice ? t('walk.voiceOn') : t('walk.voiceOff')} accessibilityHint={t('walk.tapVoice')}>
      <Animated.View style={{ width: RING, height: RING, alignItems: 'center', justifyContent: 'center', transform: [{ translateX: shake }, { scale: beat }] }}>
        <Svg width={RING} height={RING} style={StyleSheet.absoluteFill}>
          <Circle cx={RING / 2} cy={RING / 2} r={r} stroke={mode === 'turn' || mode === 'arrived' ? 'rgba(14,15,18,0.15)' : 'rgba(255,255,255,0.12)'} strokeWidth={8} fill="none" />
          <AnimatedCircle cx={RING / 2} cy={RING / 2} r={r} stroke={colors.violet} strokeWidth={8} fill="none" strokeLinecap="round"
            strokeOpacity={ring.interpolate({ inputRange: [0, 0.02, 1], outputRange: [0, 1, 1] })}
            strokeDasharray={`${C} ${C}`} strokeDashoffset={ring.interpolate({ inputRange: [0, 1], outputRange: [C, 0] })}
            transform={`rotate(-90 ${RING / 2} ${RING / 2})`} />
        </Svg>
        <View style={[s.disc, { width: D, height: D, borderRadius: D / 2, backgroundColor: discColor }]}>
          <Animated.View style={{ width: D * 0.78, height: D * 0.78, transform: [{ rotate: mode === 'arrived' ? '0deg' : spin }] }}>
            {/* Tige */}
            <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ rotate: stemRot }, { scale: stemScale }] }]}>
              <Svg width="100%" height="100%" viewBox="0 0 100 100">
                <Rect x={42} y={46} width={16} height={42} rx={8} fill={arrowColor} />
                <Circle cx={50} cy={48} r={8} fill={arrowColor} />
              </Svg>
            </Animated.View>
            {/* Tête, pivot en (50, 48) */}
            <Animated.View style={[StyleSheet.absoluteFill, { transformOrigin: '50% 48%', transform: [{ rotate: bendDeg }] }]}>
              <Svg width="100%" height="100%" viewBox="0 0 100 100">
                <Rect x={42} y={30} width={16} height={26} rx={8} fill={arrowColor} />
                <Path d="M50 10 Q52 10 54 13 L74 37 Q76 42 70 42 L30 42 Q24 42 26 37 L46 13 Q48 10 50 10 Z" fill={arrowColor} />
              </Svg>
            </Animated.View>
          </Animated.View>
        </View>
        {mode === 'arrived' && !reduce ? <Confetti D={D} /> : null}
      </Animated.View>
    </Pressable>
  );
}

function Confetti({ D }: { D: number }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(v, { toValue: 1, duration: 600, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, []);
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {Array.from({ length: 8 }, (_, i) => {
        const a = (i / 8) * 2 * Math.PI;
        return (
          <Animated.View key={i} style={{
            position: 'absolute', left: '50%', top: '50%', width: 6, height: 6, marginLeft: -3, marginTop: -3, borderRadius: 3,
            backgroundColor: i % 2 ? colors.violet : colors.ink,
            opacity: v.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
            transform: [
              { translateX: v.interpolate({ inputRange: [0, 1], outputRange: [0, Math.cos(a) * (D / 2 + 70)] }) },
              { translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, Math.sin(a) * (D / 2 + 70)] }) },
            ],
          }} />
        );
      })}
    </View>
  );
}

/* ---------------------------------------------------------------- Bandeau, pastille de marge */

function Banner({ text, dark, reduce }: { text: string; dark: boolean; reduce: boolean }) {
  const y = useRef(new Animated.Value(reduce ? 0 : -48)).current;
  const o = useRef(new Animated.Value(reduce ? 1 : 0)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(y, { toValue: 0, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(o, { toValue: 1, duration: 260, useNativeDriver: true }),
    ]).start();
  }, [text]);
  return (
    <Animated.View style={[s.banner, dark ? { backgroundColor: colors.ink } : { backgroundColor: colors.violet }, { transform: [{ translateY: y }], opacity: o }]}>
      <Text style={s.bannerText}>{text}</Text>
    </Animated.View>
  );
}

function SlackPill({ slack, reduce }: { slack: number; reduce: boolean }) {
  const late = slack < 0;
  const sc = useRef(new Animated.Value(1)).current;
  const was = useRef(late);
  useEffect(() => {
    if (late && !was.current && !reduce) {
      Animated.sequence([
        Animated.timing(sc, { toValue: 1.1, duration: 150, useNativeDriver: true }),
        Animated.timing(sc, { toValue: 1, duration: 150, useNativeDriver: true }),
      ]).start();
    }
    was.current = late;
  }, [late]);
  return (
    <Animated.View style={[s.pill, late ? { backgroundColor: colors.violet } : { backgroundColor: colors.lime }, { transform: [{ scale: sc }] }]}>
      <Text style={[s.pillText, { color: late ? '#FFFFFF' : colors.ink }]}>
        {late ? t('walk.lateBy', { n: -slack }) : slack === 0 ? t('walk.onTime') : t('walk.early', { n: slack })}
      </Text>
    </Animated.View>
  );
}

/* ---------------------------------------------------------------- Carte qui suit */

function FollowMap({ plan, live, along, nearTurn, turnAlong, stopped, reduce, arrived, nextMode, close }: {
  plan: WalkPlan; live: Live; along: number; nearTurn: boolean; turnAlong?: number; stopped: boolean; reduce: boolean;
  arrived: boolean; nextMode?: LegMode; close: boolean;
}) {
  const map = useRef<MapView>(null);
  const [h, setH] = useState(300);
  const follow = useRef(true);
  const [track, setTrack] = useState(true);
  useEffect(() => { const id = setTimeout(() => setTrack(false), 700); return () => clearTimeout(id); }, [close, arrived]);

  const k = Math.round(along / 4);
  const doneLine = useMemo(() => {
    const out: LonLat[] = [];
    for (let i = 0; i < plan.path.length && plan.cum[i] <= along; i++) out.push(plan.path[i]);
    out.push(pointAt(plan.path, plan.cum, along));
    return out;
  }, [plan, k]);
  const rest = useMemo(() => [pointAt(plan.path, plan.cum, along), ...plan.path.filter((_, i) => plan.cum[i] > along)], [plan, k]);
  // Le tronçon du prochain virage, qui pulse quand on s'en approche.
  const turnSeg = useMemo(() => {
    if (!nearTurn || turnAlong === undefined) return null;
    const a = Math.max(along, turnAlong - 15), b = Math.min(plan.length, turnAlong + 20);
    const pts: LonLat[] = [pointAt(plan.path, plan.cum, a)];
    plan.path.forEach((pt, i) => { if (plan.cum[i] > a && plan.cum[i] < b) pts.push(pt); });
    pts.push(pointAt(plan.path, plan.cum, b));
    return pts;
  }, [plan, nearTurn, turnAlong, k]);
  const [pulse, setPulse] = useState(true);
  useEffect(() => {
    if (!turnSeg || reduce) return;
    const id = setInterval(() => setPulse((v) => !v), 900);
    return () => clearInterval(id);
  }, [!!turnSeg, reduce]);

  // Caméra : marche normale 17,8 / 50°, près du virage 19 / 30°, à l'arrêt 18,5 / 0° orientée boussole.
  // L'utilisateur est placé au tiers bas : on vise un point un peu devant lui.
  const lastCam = useRef(0);
  useEffect(() => {
    if (!live.fix || !follow.current) return;
    const now = Date.now();
    if (now - lastCam.current < 500) return;
    lastCam.current = now;
    const fast = (live.fix.speed ?? 0) > 2.2;
    const zoom = reduce ? 18 : arrived ? 18.5 : stopped ? 18.5 : nearTurn ? 19 : fast ? 17.2 : 17.8;
    const pitch = reduce || stopped || arrived ? 0 : nearTurn ? 30 : fast ? 55 : 50;
    const heading = live.heading ?? 0;
    const mpp = (156543.03 * Math.cos((live.fix.p[1] * Math.PI) / 180)) / 2 ** zoom;
    const ahead = 0.25 * h * mpp;
    const rad = (heading * Math.PI) / 180;
    const dLat = (ahead * Math.cos(rad)) / 111_320;
    const dLon = (ahead * Math.sin(rad)) / (111_320 * Math.cos((live.fix.p[1] * Math.PI) / 180));
    const center = arrived ? ll(plan.end) : { latitude: live.fix.p[1] + dLat, longitude: live.fix.p[0] + dLon };
    map.current?.animateCamera({ center, heading, pitch, zoom }, { duration: reduce ? 300 : 800 });
  }, [live.fix, live.heading, nearTurn, stopped, arrived]);

  const acc = live.fix?.accuracy ?? 10;
  const mpp18 = live.fix ? (156543.03 * Math.cos((live.fix.p[1] * Math.PI) / 180)) / 2 ** 18 : 0.4;
  const halo = Math.max(30, Math.min(160, (2 * acc) / mpp18));

  return (
    <View style={s.map} onLayout={(e: LayoutChangeEvent) => setH(e.nativeEvent.layout.height)} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <MapView ref={map} style={StyleSheet.absoluteFill} {...mapLook} rotateEnabled pitchEnabled
        initialCamera={{ center: ll(live.fix?.p ?? plan.path[0]), heading: live.heading ?? 0, pitch: 45, zoom: 17.8, altitude: 600 }}
        onPanDrag={() => { follow.current = false; }}>
        <Polyline coordinates={doneLine.map(ll)} strokeColor="#C4C4CC" strokeWidth={5} lineCap="round" />
        <Polyline coordinates={rest.map(ll)} strokeColor="#FFFFFF" strokeWidth={11} lineCap="round" lineJoin="round" />
        <Polyline coordinates={rest.map(ll)} strokeColor={colors.violet} strokeWidth={7} lineCap="round" lineJoin="round" />
        {turnSeg ? <Polyline coordinates={turnSeg.map(ll)} strokeColor={pulse ? colors.violet : '#9C8BFA'} strokeWidth={9} lineCap="round" lineJoin="round" /> : null}

        <Marker coordinate={ll(plan.end)} anchor={{ x: 0, y: 1 }} tracksViewChanges={track}>
          <View style={[s.dest, close && { transform: [{ scale: 1.15 }] }]}>
            {nextMode ? <ModeAnimation mode={nextMode} size={22} ink="#FFFFFF" glass={colors.ink} playing={close && !reduce} /> : null}
            <Text style={s.destText} numberOfLines={1}>{short(plan.to)}</Text>
          </View>
        </Marker>

        {live.fix ? (
          <Marker coordinate={ll(live.fix.p)} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false} flat zIndex={20}>
            <UserDot halo={halo} approx={(live.fix.accuracy ?? 0) > 30} reduce={reduce} />
          </Marker>
        ) : null}
      </MapView>
      <Pressable onPress={() => { follow.current = true; lastCam.current = 0; }} style={s.recenter} accessibilityRole="button">
        <Text style={s.recenterText}>{t('walk.recenter')}</Text>
      </Pressable>
    </View>
  );
}

/** Toi : point violet cerclé de blanc, cône de regard (vers le haut : la carte tourne avec toi), halo de précision. */
function UserDot({ halo, approx, reduce }: { halo: number; approx: boolean; reduce: boolean }) {
  const breathe = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!approx || reduce) { breathe.setValue(1); return; }
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(breathe, { toValue: 1.15, duration: 600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(breathe, { toValue: 1, duration: 600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [approx, reduce]);
  const size = Math.max(halo, 100);
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={{ position: 'absolute', width: halo, height: halo, borderRadius: halo / 2, backgroundColor: 'rgba(91,61,245,0.10)', transform: [{ scale: breathe }] }} />
      <Svg width={100} height={100} style={{ position: 'absolute' }} viewBox="0 0 100 100">
        <Path d="M50 50 L26 8.4 A48 48 0 0 1 74 8.4 Z" fill="rgba(91,61,245,0.22)" />
      </Svg>
      <View style={s.userDot} />
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, gap: 10 },
  card: { minHeight: 196, flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: colors.ink, borderRadius: 28, padding: 14, overflow: 'hidden' },
  disc: { alignItems: 'center', justifyContent: 'center' },
  big: { fontFamily: fonts.display, fontSize: 56, lineHeight: 58, color: '#FFFFFF', letterSpacing: -1.5 },
  bigXL: { fontSize: 72, lineHeight: 74 },
  unit: { fontFamily: fonts.display, fontSize: 28 },
  line: { fontFamily: fonts.bold, fontSize: 22, lineHeight: 26, color: '#FFFFFF' },
  sub: { fontFamily: fonts.medium, fontSize: 15 },
  puis: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 6, height: 28, borderRadius: 14, paddingHorizontal: 10, backgroundColor: 'rgba(255,255,255,0.10)', marginTop: 6 },
  puisText: { fontFamily: fonts.semi, fontSize: 13 },
  banner: { minHeight: 48, borderRadius: 16, paddingHorizontal: 14, justifyContent: 'center' },
  bannerText: { fontFamily: fonts.semi, fontSize: 16, color: '#FFFFFF' },
  map: { flex: 1, minHeight: 240, borderRadius: 24, overflow: 'hidden', backgroundColor: '#EEEEEA' },
  recenter: { position: 'absolute', right: 10, bottom: 10, minHeight: 40, justifyContent: 'center', backgroundColor: colors.ink, borderRadius: radius.pill, paddingHorizontal: 14 },
  recenterText: { fontFamily: fonts.bold, fontSize: 13, color: '#FFFFFF' },
  dest: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.ink, borderRadius: 12, paddingVertical: 6, paddingHorizontal: 10, maxWidth: 220 },
  destText: { fontFamily: fonts.bold, fontSize: 14, color: '#FFFFFF' },
  userDot: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.violet, borderWidth: 4, borderColor: '#FFFFFF', shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 3 },
  strip: { backgroundColor: colors.soft, borderRadius: 24, paddingVertical: 12, paddingHorizontal: 16, gap: 4 },
  stripRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  stripMain: { fontFamily: fonts.display, fontSize: 20, color: colors.ink, flexShrink: 1 },
  stripSub: { fontFamily: fonts.medium, fontSize: 15, color: 'rgba(14,15,18,0.6)' },
  pill: { alignSelf: 'flex-start', minHeight: 32, borderRadius: 16, paddingHorizontal: 12, justifyContent: 'center', marginTop: 4 },
  pillText: { fontFamily: fonts.bold, fontSize: 14 },
});
