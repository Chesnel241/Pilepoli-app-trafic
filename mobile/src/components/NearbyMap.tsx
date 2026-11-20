import { useMemo, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from './Text';
import { IconButton } from './ui';
import { IconClose } from './icons';
import { StationSheet } from './StationSheet';
import { mapLook, useFrozenMarkers } from './MapBits';
import { t } from '../lib/i18n';
import type { NearbyStop } from '../lib/types';
import { colors, fonts, radius } from '../theme';

/**
 * Carte des stations autour de toi, à manipuler comme une vraie carte : on zoome, on se déplace,
 * on touche une station pour voir tous ses passages. Un bouton l'ouvre en plein écran.
 */
export function NearbyMap({ stops, me }: { stops: NearbyStop[]; me: { lon: number; lat: number } | null }) {
  const [full, setFull] = useState(false);
  const [picked, setPicked] = useState<NearbyStop | null>(null);
  const placed = useMemo(() => stops.filter((s) => s.lat !== undefined && s.lon !== undefined), [stops]);
  if (placed.length === 0) return null;

  return (
    <>
      <View style={s.card}>
        <StationsMap stops={placed} me={me} onPick={setPicked} padding={{ top: 50, right: 90, bottom: 30, left: 30 }} />
        <View style={s.title} pointerEvents="none"><Text style={s.titleText}>{t('dash.mapTitle')}</Text></View>
        <Pressable onPress={() => setFull(true)} style={s.expand} accessibilityRole="button" accessibilityLabel={t('map.expand')}>
          <Text style={s.expandText}>⤢</Text>
        </Pressable>
      </View>

      <Modal visible={full} animationType="slide" onRequestClose={() => setFull(false)} presentationStyle="fullScreen">
        <View style={{ flex: 1 }}>
          <StationsMap stops={placed} me={me} onPick={setPicked} padding={{ top: 140, right: 110, bottom: 80, left: 40 }} />
          <SafeAreaView style={s.overlay} pointerEvents="box-none">
            <IconButton label={t('map.close')} onPress={() => setFull(false)}><IconClose /></IconButton>
          </SafeAreaView>
          {full ? <StationSheet stop={picked} onClose={() => setPicked(null)} /> : null}
        </View>
      </Modal>

      {!full ? <StationSheet stop={picked} onClose={() => setPicked(null)} /> : null}
    </>
  );
}

function StationsMap({ stops, me, onPick, padding }: {
  stops: NearbyStop[]; me: { lon: number; lat: number } | null; onPick: (s: NearbyStop) => void;
  padding: { top: number; right: number; bottom: number; left: number };
}) {
  const map = useRef<MapView>(null);
  const track = useFrozenMarkers([stops.map((s) => s.stopRef + s.departures.map((d) => d.minutes).join()).join()]);
  const fit = () => {
    const pts = stops.map((s) => ({ latitude: s.lat!, longitude: s.lon! }));
    if (me) pts.push({ latitude: me.lat, longitude: me.lon });
    map.current?.fitToCoordinates(pts, { edgePadding: padding, animated: false });
  };
  return (
    <MapView ref={map} style={StyleSheet.absoluteFill} {...mapLook} showsUserLocation onMapReady={fit} zoomEnabled scrollEnabled>
      {stops.map((st) => (
        <Marker
          key={st.stopRef}
          coordinate={{ latitude: st.lat!, longitude: st.lon! }}
          anchor={{ x: 0, y: 0.5 }}
          tracksViewChanges={track}
          onPress={() => onPick(st)}
          accessibilityLabel={t('dash.seeStop', { name: st.name })}
        >
          <View style={s.pin}>
            <View style={s.square} />
            <View style={s.box}>
              <Text style={s.name} numberOfLines={1}>{st.name}</Text>
              <View style={s.deps}>
                {uniqueLines(st).slice(0, 3).map((d) => (
                  <View key={d.journeyRef} style={s.dep}>
                    <View style={[s.badge, { backgroundColor: d.lineColor ?? colors.violet }]}>
                      <Text style={[s.badgeText, { color: d.lineTextColor ?? '#FFFFFF' }]}>{d.lineCode}</Text>
                    </View>
                    <Text style={s.min}>{d.minutes === null || d.reliability === 'pas_vu' ? '?' : `${d.minutes}′`}</Text>
                  </View>
                ))}
              </View>
            </View>
          </View>
        </Marker>
      ))}
    </MapView>
  );
}

/** Un seul passage par ligne sur l'étiquette (le plus proche), pour qu'elle reste lisible. */
function uniqueLines(st: NearbyStop) {
  const seen = new Set<string>();
  return st.departures.filter((d) => (seen.has(d.lineCode) ? false : (seen.add(d.lineCode), true)));
}

const s = StyleSheet.create({
  card: { height: 280, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: '#EEEEEA' },
  title: { position: 'absolute', left: 10, top: 10, backgroundColor: '#FFFFFF', borderRadius: radius.pill, paddingVertical: 5, paddingHorizontal: 11 },
  titleText: { fontFamily: fonts.bold, fontSize: 12, color: colors.ink },
  expand: { position: 'absolute', right: 10, top: 10, width: 38, height: 38, borderRadius: 19, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  expandText: { fontFamily: fonts.black, fontSize: 18, color: '#FFFFFF' },
  overlay: { position: 'absolute', top: 0, left: 16 },
  pin: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  square: { width: 10, height: 10, backgroundColor: colors.ink, borderWidth: 2, borderColor: '#FFFFFF' },
  box: { backgroundColor: colors.ink, paddingVertical: 5, paddingHorizontal: 8, borderRadius: 4, gap: 4, maxWidth: 200 },
  name: { fontFamily: fonts.black, fontSize: 13, color: '#FFFFFF' },
  deps: { flexDirection: 'row', gap: 8 },
  dep: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  badge: { minWidth: 20, height: 18, borderRadius: 5, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontFamily: fonts.black, fontSize: 11 },
  min: { fontFamily: fonts.bold, fontSize: 12, color: colors.lime },
});
