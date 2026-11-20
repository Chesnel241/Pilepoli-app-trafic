import { useMemo, useRef } from 'react';
import { Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_DEFAULT } from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from './Text';
import { IconButton, PulseDot } from './ui';
import { IconClose } from './icons';
import { t } from '../lib/i18n';
import type { LonLat, Route } from '../lib/route';
import { colors, fonts, radius } from '../theme';

/** Style Google Maps (Android) doux, proche du fond de la carte compacte : peu de couleurs, pas de commerces. */
const ANDROID_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#efefe6' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#5c5f6a' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#ffffff' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ visibility: 'on' }, { color: '#e2e8d4' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
  { featureType: 'road', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'simplified' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#d6dde6' }] },
];

const ll = (p: LonLat) => ({ longitude: p[0], latitude: p[1] });

/** La carte complète du trajet, en plein écran : tracé coloré par ligne, ta position, départ et arrivée. */
export function RouteMap({ visible, onClose, route, here, source }: {
  visible: boolean; onClose: () => void; route: Route; here: LonLat | null; source: 'gps' | 'estime';
}) {
  const map = useRef<MapView>(null);
  const region = useMemo(() => {
    const { minLon, maxLon, minLat, maxLat } = route.bounds;
    return {
      latitude: (minLat + maxLat) / 2, longitude: (minLon + maxLon) / 2,
      latitudeDelta: Math.max(0.01, (maxLat - minLat) * 1.5), longitudeDelta: Math.max(0.01, (maxLon - minLon) * 1.5),
    };
  }, [route]);
  const start = route.timeline[0].p;
  const end = route.timeline[route.timeline.length - 1].p;

  const recenter = () => {
    if (here) map.current?.animateToRegion({ ...ll(here), latitudeDelta: 0.012, longitudeDelta: 0.012 }, 350);
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} presentationStyle="fullScreen">
      <View style={s.screen}>
        <MapView
          ref={map}
          style={StyleSheet.absoluteFill}
          provider={PROVIDER_DEFAULT}
          initialRegion={region}
          mapType={Platform.OS === 'ios' ? 'mutedStandard' : 'standard'}
          customMapStyle={Platform.OS === 'android' ? ANDROID_STYLE : undefined}
          showsUserLocation
          showsMyLocationButton={false}
          showsPointsOfInterests={false}
          showsCompass={false}
          toolbarEnabled={false}
          pitchEnabled={false}
        >
          {route.segments.map((sg, i) => (
            <Polyline
              key={i}
              coordinates={sg.points.map(ll)}
              strokeColor={sg.mode === 'walk' ? colors.ink : sg.color}
              strokeWidth={sg.mode === 'walk' ? 3 : 6}
              lineDashPattern={sg.mode === 'walk' ? [2, 8] : undefined}
              lineCap="round"
              lineJoin="round"
            />
          ))}
          <Marker coordinate={ll(start)} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}>
            <View style={s.startPin} />
          </Marker>
          <Marker coordinate={ll(end)} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}>
            <View style={s.endPin} />
          </Marker>
          {/* Sans GPS, on montre où tu devrais être d'après les horaires (le point bleu du système reste la vraie position). */}
          {here && source === 'estime' ? (
            <Marker coordinate={ll(here)} anchor={{ x: 0.5, y: 0.5 }}>
              <View style={s.estimate}><PulseDot color={colors.violet} size={14} /></View>
            </Marker>
          ) : null}
        </MapView>

        <SafeAreaView style={s.overlay} pointerEvents="box-none">
          <View style={s.top} pointerEvents="box-none">
            <IconButton label={t('map.close')} onPress={onClose}><IconClose /></IconButton>
            <Pressable onPress={recenter} style={s.recenter} accessibilityRole="button">
              <Text style={s.recenterText}>{t('map.recenter')}</Text>
            </Pressable>
          </View>
          {source === 'estime' ? (
            <View style={s.note}><Text style={s.noteText}>{t('map.estimatedNote')}</Text></View>
          ) : null}
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#EFEFE6' },
  overlay: { flex: 1, justifyContent: 'space-between', padding: 16 },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  recenter: { backgroundColor: colors.ink, borderRadius: radius.pill, paddingVertical: 12, paddingHorizontal: 18 },
  recenterText: { fontFamily: fonts.bold, fontSize: 15, color: '#FFFFFF' },
  note: { backgroundColor: 'rgba(255,255,255,0.95)', borderRadius: radius.md, padding: 12 },
  noteText: { fontFamily: fonts.semi, fontSize: 14, lineHeight: 19, color: colors.ink },
  startPin: { width: 16, height: 16, borderRadius: 8, backgroundColor: '#FFFFFF', borderWidth: 4, borderColor: colors.ink },
  endPin: { width: 20, height: 20, borderRadius: 10, backgroundColor: colors.lime, borderWidth: 4, borderColor: colors.ink },
  estimate: { width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.9)', alignItems: 'center', justifyContent: 'center' },
});
