import { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View } from 'react-native';
import MapView, { Polyline } from 'react-native-maps';
import Svg, { Path } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { Text } from './Text';
import { PlaceLabel, mapLook, useFrozenMarkers } from './MapBits';
import { angleDiff, pointAt, type LonLat } from '../lib/geo';
import { walkMinutes, walkStatus, type TurnKind, type WalkPlan, type WalkStatus } from '../lib/walk';
import type { Live } from '../lib/location';
import { hhmm } from '../lib/trip';
import { t } from '../lib/i18n';
import { colors, fonts, radius } from '../theme';

const ll = (p: LonLat) => ({ longitude: p[0], latitude: p[1] });
const dist = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1).replace('.', ',')} km` : `${Math.max(5, Math.round(m / 5) * 5)} m`);
const short = (n: string) => n.replace(/\s*\(.*\)$/, '').trim();

/**
 * Le GPS à pied : une grosse flèche qui pointe là où marcher (elle tourne avec toi), la prochaine consigne
 * en clair, une carte qui suit ton regard, et ce qu'il te reste par rapport à ton train.
 */
export function WalkNav({ plan, live, trainAt, compact = false, onStatus }: {
  plan: WalkPlan; live: Live; trainAt?: number; compact?: boolean; onStatus?: (s: WalkStatus | null) => void;
}) {
  const prevAlong = useRef(0);
  const status = useMemo(() => {
    if (!live.fix) return null;
    const s = walkStatus(plan, live.fix.p, live.fix.accuracy, prevAlong.current);
    prevAlong.current = s.along;
    return s;
  }, [plan, live.fix]);
  useEffect(() => { onStatus?.(status); }, [status?.along, status?.arrived, status?.onRoute]);

  // La flèche : cap à suivre moins l'orientation du téléphone. Animée en douceur, par le chemin le plus court.
  const rot = useRef(new Animated.Value(0)).current;
  const lastRot = useRef(0);
  const target = status ? (live.heading !== null ? angleDiff(status.heading, live.heading) : status.heading) : 0;
  useEffect(() => {
    const next = lastRot.current + angleDiff(target, lastRot.current);
    lastRot.current = next;
    Animated.timing(rot, { toValue: next, duration: 250, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
  }, [target]);

  // Petite vibration à 20 m d'un virage, et à l'arrivée.
  const buzzed = useRef<string>('');
  useEffect(() => {
    if (!status) return;
    const key = status.arrived ? 'arrived' : status.next && status.next.inMeters <= 20 ? `turn-${status.next.name}-${status.next.kind}` : '';
    if (key && key !== buzzed.current) {
      buzzed.current = key;
      (status.arrived ? Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success) : Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)).catch(() => null);
    }
  }, [status?.arrived, status?.next?.inMeters]);

  const remaining = status?.remaining ?? plan.length;
  const mins = walkMinutes(remaining);
  const arriveAt = Date.now() + mins * 60_000;
  const slack = trainAt ? Math.floor((trainAt - arriveAt) / 60_000) : null;
  const arrived = !!status?.arrived;

  return (
    <View style={[s.wrap, compact && { gap: 8 }]}>
      <View style={[s.card, arrived && s.cardArrived]} accessibilityLiveRegion="polite">
        {arrived ? (
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={[s.big, { color: colors.ink }]}>{t('walk.arrived')}</Text>
            <Text style={[s.street, { color: colors.ink }]}>{t('walk.arrivedSub', { name: short(plan.to) })}</Text>
          </View>
        ) : (
          <>
            <View style={s.arrowWrap} accessibilityLabel={status ? `${Math.round(status.heading)}°` : undefined}>
              <Animated.View style={{ transform: [{ rotate: rot.interpolate({ inputRange: [-3600, 3600], outputRange: ['-3600deg', '3600deg'] }) }] }}>
                <Svg width={58} height={58} viewBox="0 0 24 24"><Path d="M12 2 L20 21 L12 16.5 L4 21 Z" fill={colors.ink} /></Svg>
              </Animated.View>
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              {status?.next ? (
                <>
                  <Text style={s.big}>{t('walk.inM', { n: Math.max(5, Math.round(status.next.inMeters / 5) * 5) })}</Text>
                  <View style={s.turnRow}>
                    <TurnIcon kind={status.next.kind} />
                    <Text style={s.turn}>{t(`walk.${status.next.kind}`)}</Text>
                  </View>
                  {status.next.name ? <Text style={s.street} numberOfLines={1}>{t('walk.onto', { name: status.next.name })}</Text> : null}
                </>
              ) : (
                <>
                  <Text style={s.big}>{dist(remaining)}</Text>
                  <Text style={s.turn}>{t('walk.straight')}</Text>
                  <Text style={s.street} numberOfLines={1}>{t('walk.until', { name: short(plan.to) })}</Text>
                </>
              )}
            </View>
          </>
        )}
      </View>

      {live.gps === 'granted' && !live.fix ? <Banner text={t('walk.noGps')} /> : null}
      {status && !status.onRoute ? <Banner text={t('walk.offRoute')} /> : null}
      {!arrived && live.fix && live.heading === null ? <Banner text={t('walk.noHeading')} soft /> : null}

      <FollowMap plan={plan} live={live} along={status?.along ?? 0} compact={compact} />

      <View style={s.strip}>
        <Text style={s.stripMain} numberOfLines={1}>{short(plan.to)}</Text>
        <Text style={s.stripSub}>{t('walk.summary', { m: dist(remaining), min: mins, time: hhmm(new Date(arriveAt).toISOString()) })}</Text>
        {trainAt && !arrived ? (
          <Text style={[s.slack, slack !== null && slack < 0 ? s.late : slack !== null && slack <= 1 ? s.hurry : null]}>
            {slack === null ? '' : slack < 0 ? t('walk.late', { time: hhmm(new Date(trainAt).toISOString()) })
              : slack <= 1 ? t('walk.hurry', { time: hhmm(new Date(trainAt).toISOString()) })
              : t('walk.slack', { time: hhmm(new Date(trainAt).toISOString()), n: slack })}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function Banner({ text, soft = false }: { text: string; soft?: boolean }) {
  return <View style={[s.banner, soft && { backgroundColor: colors.soft }]}><Text style={[s.bannerText, soft && { color: colors.muted }]}>{text}</Text></View>;
}

/** Flèche de virage : une seule forme, tournée selon le virage (plus lisible qu'une famille d'icônes). */
function TurnIcon({ kind }: { kind: TurnKind }) {
  const angle = { straight: 0, slightLeft: -45, left: -90, sharpLeft: -135, slightRight: 45, right: 90, sharpRight: 135, uturn: 180 }[kind];
  return (
    <View style={{ transform: [{ rotate: `${angle}deg` }] }}>
      <Svg width={22} height={22} viewBox="0 0 24 24"><Path d="M12 3 L19 12 H14.5 V21 H9.5 V12 H5 Z" fill={colors.lime} /></Svg>
    </View>
  );
}

/** Carte qui te suit, orientée dans ton sens de marche : chemin restant en violet, parcouru en gris. */
function FollowMap({ plan, live, along, compact }: { plan: WalkPlan; live: Live; along: number; compact: boolean }) {
  const map = useRef<MapView>(null);
  const follow = useRef(true);
  const track = useFrozenMarkers([plan.to]);
  const done = useMemo(() => {
    const out: LonLat[] = [];
    for (let i = 0; i < plan.path.length && plan.cum[i] <= along; i++) out.push(plan.path[i]);
    out.push(pointAt(plan.path, plan.cum, along));
    return out;
  }, [plan, Math.round(along / 5)]);
  const rest = useMemo(() => [pointAt(plan.path, plan.cum, along), ...plan.path.filter((_, i) => plan.cum[i] > along)], [plan, Math.round(along / 5)]);

  const lastCam = useRef(0);
  useEffect(() => {
    if (!live.fix || !follow.current) return;
    const now = Date.now();
    if (now - lastCam.current < 900) return;
    lastCam.current = now;
    map.current?.animateCamera({ center: ll(live.fix.p), heading: live.heading ?? 0, pitch: 0, zoom: 17.5 }, { duration: 700 });
  }, [live.fix, live.heading]);

  return (
    <View style={[s.map, compact && { minHeight: 150 }]}>
      <MapView
        ref={map}
        style={StyleSheet.absoluteFill}
        {...mapLook}
        rotateEnabled
        showsUserLocation
        followsUserLocation={false}
        initialCamera={{ center: ll(plan.path[0]), heading: 0, pitch: 0, zoom: 17, altitude: 800 }}
        onPanDrag={() => { follow.current = false; }}
      >
        <Polyline coordinates={done.map(ll)} strokeColor="#B9BAC2" strokeWidth={6} lineCap="round" />
        <Polyline coordinates={rest.map(ll)} strokeColor="#FFFFFF" strokeWidth={10} lineCap="round" lineJoin="round" />
        <Polyline coordinates={rest.map(ll)} strokeColor={colors.violet} strokeWidth={6} lineCap="round" lineJoin="round" />
        <PlaceLabel lat={plan.end[1]} lon={plan.end[0]} name={short(plan.to)} track={track} side="right" />
      </MapView>
      <Pressable onPress={() => { follow.current = true; lastCam.current = 0; if (live.fix) map.current?.animateCamera({ center: ll(live.fix.p), heading: live.heading ?? 0, zoom: 17.5 }, { duration: 500 }); }}
        style={s.recenter} accessibilityRole="button">
        <Text style={s.recenterText}>{t('walk.recenter')}</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, gap: 10 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 16, backgroundColor: colors.ink, borderRadius: 26, padding: 16 },
  cardArrived: { backgroundColor: colors.lime },
  arrowWrap: { width: 84, height: 84, borderRadius: 42, backgroundColor: colors.lime, alignItems: 'center', justifyContent: 'center' },
  big: { fontFamily: fonts.display, fontSize: 32, lineHeight: 35, color: '#FFFFFF' },
  turnRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  turn: { fontFamily: fonts.black, fontSize: 18, color: colors.lime },
  street: { fontFamily: fonts.semi, fontSize: 15, color: '#D7D7DE' },
  banner: { backgroundColor: colors.amberBg, borderRadius: radius.md, paddingVertical: 8, paddingHorizontal: 12 },
  bannerText: { fontFamily: fonts.semi, fontSize: 14, color: colors.amberInk },
  map: { flex: 1, minHeight: 200, borderRadius: 24, overflow: 'hidden', backgroundColor: '#EEEEEA' },
  recenter: { position: 'absolute', right: 10, bottom: 10, backgroundColor: colors.ink, borderRadius: radius.pill, paddingVertical: 8, paddingHorizontal: 14 },
  recenterText: { fontFamily: fonts.bold, fontSize: 13, color: '#FFFFFF' },
  strip: { backgroundColor: colors.soft, borderRadius: 18, paddingVertical: 10, paddingHorizontal: 14, gap: 2 },
  stripMain: { fontFamily: fonts.display, fontSize: 18, color: colors.ink },
  stripSub: { fontFamily: fonts.semi, fontSize: 14, color: colors.muted },
  slack: { fontFamily: fonts.bold, fontSize: 14, color: '#1F5E14', marginTop: 2 },
  hurry: { color: colors.amberInk },
  late: { color: colors.redInk },
});
