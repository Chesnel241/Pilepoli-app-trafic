import { useMemo, useRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { Text } from './Text';
import { ModeAnimation } from './ModeAnimation';
import { PlaceLabel, mapLook, useFrozenMarkers } from './MapBits';
import { estimatedAt, meters, snap, type LonLat, type Route } from '../lib/route';
import { hhmm, type GuideStop } from '../lib/trip';
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
const ll = (p: LonLat) => ({ longitude: p[0], latitude: p[1] });

/** Tracé du trajet sur une vraie carte : liseré blanc puis couleur de la ligne, marche en pointillés. */
export function RouteLines({ route, width = 5 }: { route: Route; width?: number }) {
  return (
    <>
      {route.segments.map((sg, i) => sg.mode === 'walk' ? (
        <Polyline key={`w${i}`} coordinates={sg.points.map(ll)} strokeColor={colors.ink} strokeWidth={3} lineDashPattern={[2, 7]} lineCap="round" />
      ) : (
        <Polyline key={`h${i}`} coordinates={sg.points.map(ll)} strokeColor="#FFFFFF" strokeWidth={width + 4} lineCap="round" lineJoin="round" />
      ))}
      {route.segments.map((sg, i) => sg.mode === 'walk' ? null : (
        <Polyline key={`c${i}`} coordinates={sg.points.map(ll)} strokeColor={sg.color} strokeWidth={width} lineCap="round" lineJoin="round" />
      ))}
    </>
  );
}

/** Le véhicule sur la ligne, comme l'avion sur l'écran de vol : pastille blanche, cerclée de la couleur de la ligne. */
export function VehicleMarker({ p, mode, color, track }: { p: LonLat; mode: LegMode; color: string; track: boolean }) {
  return (
    <Marker coordinate={ll(p)} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={track} zIndex={10}>
      <View style={[s.vehicle, { borderColor: color }]}>
        <ModeAnimation mode={mode} size={26} playing={false} />
      </View>
    </Marker>
  );
}

/** Étapes à étiqueter : départ, arrivée et chaque correspondance. */
export function keyStops(stops: GuideStop[]) {
  return stops.filter((st, i) => st.lat !== undefined && st.lon !== undefined && (i === 0 || st.walkAfter || st.end));
}

/**
 * Carte du trajet en haut du guidage, façon écran de vol : vrai fond de carte, tracé épais,
 * étiquettes noires, et le véhicule qui avance. Un bandeau dit ce qu'il reste. Un tap ouvre la carte entière.
 */
export function RouteCard({ journey, route, stops, now, fix, mode, onOpen, toName, height = 170 }: {
  journey: Journey; route: Route | null; stops: GuideStop[]; now: number; fix: Fix | null; mode: LegMode;
  onOpen: () => void; toName: string; height?: number;
}) {
  const map = useRef<MapView>(null);
  const track = useFrozenMarkers([route, stops.length, mode]);
  const here = route ? whereAmI(route, now, fix) : null;
  const labels = useMemo(() => keyStops(stops), [stops]);
  const color = stops.find((st) => st.mode === mode)?.color ?? colors.violet;

  // Ce qu'il reste : horaires prévus décalés sur la réalité (now = instant « horaires » de là où tu es).
  const left = Math.max(0, Math.round((Date.parse(journey.arrivalAt) - now) / 60_000));
  const kmLeft = route && here ? Math.max(0, (route.length * (1 - here.fraction)) / 1000) : null;

  const fit = () => {
    if (!route) return;
    const pts = route.segments.flatMap((sg) => sg.points).map(ll);
    map.current?.fitToCoordinates(pts, { edgePadding: { top: 56, right: 40, bottom: 40, left: 40 }, animated: false });
  };

  return (
    <Pressable onPress={onOpen} style={[s.card, { height }]} accessibilityRole="button" accessibilityHint={t('map.open')}
      accessibilityLabel={`${t('map.left', { n: left })}, ${t('choice.arrival', { time: hhmm(journey.arrivalAt) })}`}>
      {route ? (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <MapView
            ref={map}
            style={StyleSheet.absoluteFill}
            {...mapLook}
            scrollEnabled={false}
            zoomEnabled={false}
            onMapReady={fit}
            onLayout={fit}
          >
            <RouteLines route={route} />
            {labels.map((st, i) => (
              <PlaceLabel key={`${st.name}-${i}`} lat={st.lat!} lon={st.lon!} name={short(st.name)} track={track}
                strong={i === 0 || st.end} side={i === labels.length - 1 ? 'left' : 'right'} />
            ))}
            {here ? <VehicleMarker p={here.p} mode={mode} color={color} track={track} /> : null}
          </MapView>
        </View>
      ) : <View style={[StyleSheet.absoluteFill, { backgroundColor: '#EEEEEA' }]} />}

      {/* Bandeau d'infos, comme en vol : ce qu'il reste, et l'heure d'arrivée. */}
      <View style={s.strip} pointerEvents="none">
        <View style={s.stat}><Text style={s.statBig}>{left}<Text style={s.statUnit}> {t('common.min')}</Text></Text><Text style={s.statLabel}>{t('map.remaining')}</Text></View>
        {kmLeft !== null ? <View style={s.stat}><Text style={s.statBig}>{kmLeft < 10 ? kmLeft.toFixed(1).replace('.', ',') : Math.round(kmLeft)}<Text style={s.statUnit}> km</Text></Text><Text style={s.statLabel}>{t('map.distance')}</Text></View> : null}
        <View style={[s.stat, { alignItems: 'flex-end', flex: 1 }]}>
          <Text style={s.statBig}>{hhmm(journey.arrivalAt)}</Text>
          <Text style={s.statLabel} numberOfLines={1}>{short(toName)}</Text>
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

/** Distance utile à d'autres écrans. */
export { meters };

const s = StyleSheet.create({
  card: { height: 200, borderRadius: 26, overflow: 'hidden', backgroundColor: '#EEEEEA' },
  strip: { position: 'absolute', top: 8, left: 8, right: 8, flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: colors.ink, borderRadius: 18, paddingVertical: 7, paddingHorizontal: 14 },
  stat: { gap: 0 },
  statBig: { fontFamily: fonts.display, fontSize: 19, color: '#FFFFFF' },
  statUnit: { fontFamily: fonts.bold, fontSize: 12, color: '#FFFFFF' },
  statLabel: { fontFamily: fonts.semi, fontSize: 11, color: '#B9BAC2' },
  foot: { position: 'absolute', left: 10, right: 10, bottom: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  src: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: radius.pill, paddingVertical: 4, paddingHorizontal: 9 },
  srcDot: { width: 7, height: 7, borderRadius: 4 },
  srcText: { fontFamily: fonts.bold, fontSize: 11, color: colors.ink },
  open: { backgroundColor: '#FFFFFF', borderRadius: radius.pill, paddingVertical: 5, paddingHorizontal: 11 },
  openText: { fontFamily: fonts.bold, fontSize: 12, color: colors.ink },
  vehicle: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#FFFFFF', borderWidth: 3, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 4 },
});
