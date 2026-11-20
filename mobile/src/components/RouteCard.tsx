import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle, Polyline } from 'react-native-svg';
import { Text } from './Text';
import { PulseDot } from './ui';
import { ModeAnimation } from './ModeAnimation';
import { estimatedAt, projector, snap, type LonLat, type Route } from '../lib/route';
import { hhmm } from '../lib/trip';
import { t } from '../lib/i18n';
import type { Journey, LegMode } from '../lib/types';
import { colors, fonts, radius } from '../theme';

/** Écart maximal entre le GPS et le tracé pour qu'on lui fasse confiance (au-delà : on se fie aux horaires). */
const GPS_MAX_OFFSET_M = 250;

export interface Fix { p: LonLat; at: number; accuracy: number | null }

/** Où en est-on : position GPS recalée sur le tracé si elle est fraîche et cohérente, sinon position prévue. */
export function whereAmI(route: Route, now: number, fix: Fix | null) {
  if (fix && Date.now() - fix.at < 60_000 && (fix.accuracy ?? 0) < 150) {
    const s = snap(route, fix.p);
    if (s.offset < GPS_MAX_OFFSET_M) return { p: s.p, fraction: s.fraction, source: 'gps' as const };
  }
  return { ...estimatedAt(route, now), source: 'estime' as const };
}

const short = (name: string) => name.replace(/\s*\(.*\)$/, '').trim();

/**
 * La carte du trajet, en haut du guidage : départ et arrivée en grand, reliés par une ligne
 * où avance l'icône du transport, et le vrai tracé dessiné en fond. Un tap ouvre la carte complète.
 */
export function RouteCard({ journey, route, now, fix, mode, onOpen, fromName, toName }: {
  journey: Journey; route: Route | null; now: number; fix: Fix | null; mode: LegMode;
  onOpen: () => void; fromName: string; toName: string;
}) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  const here = route ? whereAmI(route, now, fix) : null;
  const fraction = here?.fraction ?? Math.min(1, Math.max(0, (now - Date.parse(journey.departureAt)) / Math.max(1, Date.parse(journey.arrivalAt) - Date.parse(journey.departureAt))));

  const MAP_TOP = 58;
  const drawn = useMemo(() => {
    if (!route || size.w === 0) return null;
    const proj = projector(route, size.w, size.h - MAP_TOP, 18);
    return {
      proj,
      segs: route.segments.map((s) => ({ ...s, pts: s.points.map((p) => proj(p).join(',')).join(' ') })),
      start: proj(route.timeline[0].p),
      end: proj(route.timeline[route.timeline.length - 1].p),
    };
  }, [route, size.w, size.h]);
  const me = drawn && here ? drawn.proj(here.p) : null;
  // Le fond (trame + tracé) ne change pas pendant le trajet : il est dessiné une seule fois.
  const background = useMemo(() => (drawn ? (
        <Svg style={[StyleSheet.absoluteFill, { top: MAP_TOP }]} width={size.w} height={size.h - MAP_TOP}>
          {/* Trame de points discrète, comme un fond de carte. */}
          {Array.from({ length: Math.ceil(size.w / 14) * Math.ceil((size.h - MAP_TOP) / 14) }, (_, i) => {
            const cols = Math.ceil(size.w / 14);
            return <Circle key={i} cx={(i % cols) * 14 + 7} cy={Math.floor(i / cols) * 14 + 7} r={0.9} fill={colors.ink} opacity={0.12} />;
          })}
          {drawn.segs.map((sg, i) => sg.mode === 'walk'
            ? <Polyline key={i} points={sg.pts} stroke={colors.ink} strokeWidth={2.5} strokeDasharray="1 5" strokeLinecap="round" fill="none" opacity={0.6} />
            : (
              <Polyline key={i} points={sg.pts} stroke={sg.color} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" fill="none" />
            ))}
          <Circle cx={drawn.start[0]} cy={drawn.start[1]} r={4.5} fill="#FFFFFF" stroke={colors.ink} strokeWidth={2.5} />
          <Circle cx={drawn.end[0]} cy={drawn.end[1]} r={5} fill={colors.lime} stroke={colors.ink} strokeWidth={2.5} />
        </Svg>
  ) : null), [drawn, size.w, size.h]);

  return (
    <Pressable
      onPress={onOpen}
      onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
      style={({ pressed }) => [s.card, pressed && { opacity: 0.92 }]}
      accessibilityRole="button"
      accessibilityLabel={`${fromName} → ${toName}, ${Math.round(fraction * 100)} %`}
      accessibilityHint={t('map.open')}
    >
      {background}
      {me ? (
        <View style={[s.me, { left: me[0] - 9, top: MAP_TOP + me[1] - 9 }]} pointerEvents="none">
          <PulseDot color={colors.violet} size={18} />
        </View>
      ) : null}

      {/* En-tête façon billet : départ ●·····[transport]·····● arrivée */}
      <View style={s.head}>
        <View style={s.end}>
          <Text style={s.place} numberOfLines={1}>{short(fromName)}</Text>
          <Text style={s.time}>{hhmm(journey.departureAt)}</Text>
        </View>
        <View style={s.track}>
          <View style={s.dotEnd} />
          <View style={s.dashes}>
            {Array.from({ length: 9 }, (_, i) => <View key={i} style={[s.dash, i / 9 < fraction && s.dashDone]} />)}
          </View>
          <View style={s.dotEnd} />
          <View style={[s.pill, { left: `${Math.round(8 + fraction * 72)}%` }]}>
            <ModeAnimation mode={mode} size={22} ink="#FFFFFF" glass={colors.ink} accent={colors.lime} playing={false} />
          </View>
        </View>
        <View style={[s.end, { alignItems: 'flex-end' }]}>
          <Text style={s.place} numberOfLines={1}>{short(toName)}</Text>
          <Text style={s.time}>{hhmm(journey.arrivalAt)}</Text>
        </View>
      </View>

      <View style={s.foot} pointerEvents="none">
        <View style={s.src}>
          <View style={[s.srcDot, { backgroundColor: here?.source === 'gps' ? colors.violet : '#B87800' }]} />
          <Text style={s.srcText}>{here?.source === 'gps' ? t('map.gps') : t('map.estimated')}</Text>
        </View>
        <View style={s.open}><Text style={s.openText}>{t('map.map')}</Text></View>
      </View>
    </Pressable>
  );
}

const s = StyleSheet.create({
  card: { height: 150, borderRadius: 26, backgroundColor: '#EFEFE6', overflow: 'hidden' },
  head: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingTop: 10, gap: 8 },
  end: { width: '30%', gap: 1 },
  place: { fontFamily: fonts.display, fontSize: 17, color: colors.ink },
  time: { fontFamily: fonts.semi, fontSize: 12, color: colors.muted },
  track: { flex: 1, height: 30, flexDirection: 'row', alignItems: 'center' },
  dotEnd: { width: 8, height: 8, borderRadius: 4, borderWidth: 2, borderColor: colors.ink, backgroundColor: '#EFEFE6' },
  dashes: { flex: 1, flexDirection: 'row', justifyContent: 'space-evenly', alignItems: 'center' },
  dash: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: colors.ink, opacity: 0.35 },
  dashDone: { opacity: 1 },
  pill: { position: 'absolute', marginLeft: -19, width: 38, height: 30, borderRadius: radius.pill, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  me: { position: 'absolute', width: 18, height: 18, alignItems: 'center', justifyContent: 'center' },
  foot: { position: 'absolute', left: 12, right: 12, bottom: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  src: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.85)', borderRadius: radius.pill, paddingVertical: 4, paddingHorizontal: 9 },
  srcDot: { width: 7, height: 7, borderRadius: 4 },
  srcText: { fontFamily: fonts.bold, fontSize: 11, color: colors.ink },
  open: { backgroundColor: '#FFFFFF', borderRadius: radius.pill, paddingVertical: 5, paddingHorizontal: 11 },
  openText: { fontFamily: fonts.bold, fontSize: 12, color: colors.ink },
});
