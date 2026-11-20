import { useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import MapView from 'react-native-maps';
import { router } from 'expo-router';
import { Text } from './Text';
import { PlaceLabel, mapLook, useFrozenMarkers } from './MapBits';
import { t } from '../lib/i18n';
import type { NearbyStop } from '../lib/types';
import { colors, fonts, radius } from '../theme';

/**
 * Carte des stations autour de toi, avec leurs prochains passages écrits sur l'étiquette.
 * On touche une station pour voir tous ses passages et ses sorties.
 */
export function NearbyMap({ stops, me }: { stops: NearbyStop[]; me: { lon: number; lat: number } | null }) {
  const map = useRef<MapView>(null);
  const placed = stops.filter((s) => s.lat !== undefined && s.lon !== undefined);
  const track = useFrozenMarkers([placed.map((s) => s.stopRef + s.departures.map((d) => d.minutes).join()).join()]);
  if (placed.length === 0) return null;

  const fit = () => {
    const pts = placed.map((s) => ({ latitude: s.lat!, longitude: s.lon! }));
    if (me) pts.push({ latitude: me.lat, longitude: me.lon });
    map.current?.fitToCoordinates(pts, { edgePadding: { top: 40, right: 110, bottom: 30, left: 30 }, animated: false });
  };

  return (
    <View style={s.card}>
      <MapView ref={map} style={StyleSheet.absoluteFill} {...mapLook} showsUserLocation scrollEnabled={false} zoomEnabled={false} onMapReady={fit} onLayout={fit}>
        {placed.map((st) => (
          <PlaceLabel
            key={st.stopRef}
            lat={st.lat!}
            lon={st.lon!}
            name={st.name}
            track={track}
            onPress={() => router.push({ pathname: '/arret', params: { ref: st.stopRef, area: st.areaNumber, name: st.name } })}
          >
            <View style={s.deps}>
              {st.departures.slice(0, 2).map((d) => (
                <View key={d.journeyRef} style={s.dep}>
                  <View style={[s.badge, { backgroundColor: d.lineColor ?? colors.violet }]}>
                    <Text style={[s.badgeText, { color: d.lineTextColor ?? '#FFFFFF' }]}>{d.lineCode}</Text>
                  </View>
                  <Text style={s.min}>{d.minutes === null || d.reliability === 'pas_vu' ? '?' : `${d.minutes}′`}</Text>
                </View>
              ))}
            </View>
          </PlaceLabel>
        ))}
      </MapView>
      <View style={s.title} pointerEvents="none"><Text style={s.titleText}>{t('dash.mapTitle')}</Text></View>
    </View>
  );
}

const s = StyleSheet.create({
  card: { height: 230, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: '#EEEEEA' },
  title: { position: 'absolute', left: 10, top: 10, backgroundColor: '#FFFFFF', borderRadius: radius.pill, paddingVertical: 5, paddingHorizontal: 11 },
  titleText: { fontFamily: fonts.bold, fontSize: 12, color: colors.ink },
  deps: { flexDirection: 'row', gap: 8 },
  dep: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  badge: { minWidth: 20, height: 18, borderRadius: 5, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontFamily: fonts.black, fontSize: 11 },
  min: { fontFamily: fonts.bold, fontSize: 12, color: colors.lime },
});
