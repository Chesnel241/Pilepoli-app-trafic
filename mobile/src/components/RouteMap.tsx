import { useMemo, useRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { CloseButton, FullModal } from './FullModal';
import MapView from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from './Text';
import { PlaceLabel, mapLook, useFrozenMarkers } from './MapBits';
import { RouteLines, VehicleMarker, keyStops } from './RouteCard';
import { t } from '../lib/i18n';
import type { LonLat, Route } from '../lib/route';
import type { GuideStop } from '../lib/trip';
import type { LegMode } from '../lib/types';
import { colors, fonts, radius } from '../theme';

const ll = (p: LonLat) => ({ longitude: p[0], latitude: p[1] });
const short = (name: string) => name.replace(/\s*\(.*\)$/, '').trim();

/** La carte complète du trajet, en plein écran, dans le même esprit que la carte du guidage. */
export function RouteMap({ visible, onClose, route, stops, here, source, mode }: {
  visible: boolean; onClose: () => void; route: Route; stops: GuideStop[]; here: LonLat | null; source: 'gps' | 'estime'; mode: LegMode;
}) {
  const map = useRef<MapView>(null);
  const track = useFrozenMarkers([visible, mode]);
  const labels = useMemo(() => keyStops(stops), [stops]);
  // Tous les arrêts du trajet, en petit : on peut compter ceux qui restent.
  const minor = useMemo(() => stops.filter((st) => st.lat !== undefined && !labels.includes(st)), [stops, labels]);
  const color = stops.find((st) => st.mode === mode)?.color ?? colors.violet;

  const fit = () => {
    const pts = route.segments.flatMap((sg) => sg.points).map(ll);
    map.current?.fitToCoordinates(pts, { edgePadding: { top: 120, right: 50, bottom: 120, left: 50 }, animated: false });
  };
  const recenter = () => {
    if (here) map.current?.animateToRegion({ ...ll(here), latitudeDelta: 0.012, longitudeDelta: 0.012 }, 350);
  };

  return (
    <FullModal visible={visible} animationType="slide" onRequestClose={onClose} presentationStyle="fullScreen">
      <View style={s.screen}>
        <MapView ref={map} style={StyleSheet.absoluteFill} {...mapLook} showsUserLocation showsMyLocationButton={false} onMapReady={fit}>
          <RouteLines route={route} width={6} />
          {minor.map((st, i) => (
            <PlaceLabel key={`m${i}`} lat={st.lat!} lon={st.lon!} name={short(st.name)} strong={false} track={track} />
          ))}
          {labels.map((st, i) => (
            <PlaceLabel key={`k${i}`} lat={st.lat!} lon={st.lon!} name={short(st.name)} track={track}
              strong side={i === labels.length - 1 ? 'left' : 'right'} />
          ))}
          {here ? <VehicleMarker p={here} mode={mode} color={color} track={track} /> : null}
        </MapView>

        <SafeAreaView style={s.overlay} pointerEvents="box-none">
          <View style={s.top} pointerEvents="box-none">
            <CloseButton onPress={onClose} />
            <Pressable onPress={recenter} style={s.recenter} accessibilityRole="button">
              <Text style={s.recenterText}>{t('map.recenter')}</Text>
            </Pressable>
          </View>
          {source === 'estime' ? (
            <View style={s.note}><Text style={s.noteText}>{t('map.estimatedNote')}</Text></View>
          ) : null}
        </SafeAreaView>
      </View>
    </FullModal>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#EEEEEA' },
  overlay: { flex: 1, justifyContent: 'space-between', padding: 16 },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  recenter: { backgroundColor: colors.ink, borderRadius: radius.pill, paddingVertical: 12, paddingHorizontal: 18 },
  recenterText: { fontFamily: fonts.bold, fontSize: 15, color: '#FFFFFF' },
  note: { backgroundColor: 'rgba(255,255,255,0.95)', borderRadius: radius.md, padding: 12 },
  noteText: { fontFamily: fonts.semi, fontSize: 14, lineHeight: 19, color: colors.ink },
});
