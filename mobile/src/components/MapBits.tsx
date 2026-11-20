import { useEffect, useState, type ReactNode } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { Marker } from 'react-native-maps';
import { Text } from './Text';
import { colors, fonts } from '../theme';

/**
 * Éléments communs aux cartes Pilepoil, dans l'esprit des cartes de vol en avion :
 * fond de carte réel et discret, tracé épais, étiquettes noires à texte blanc posées sur un petit carré.
 */

/** Fond Google Maps (Android) doux et dépouillé. Sur iPhone : Apple Plans en mode « sourdine ». */
export const ANDROID_MAP_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#eeeeea' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#6b6e78' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#f7f7f4' }] },
  { featureType: 'administrative', elementType: 'geometry', stylers: [{ color: '#d0d0c8' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ visibility: 'on' }, { color: '#dfe5d2' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
  { featureType: 'road', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#f4f4ef' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#c9d3dc' }] },
];

export const mapLook = {
  mapType: (Platform.OS === 'ios' ? 'mutedStandard' : 'standard') as 'mutedStandard' | 'standard',
  customMapStyle: Platform.OS === 'android' ? ANDROID_MAP_STYLE : undefined,
  showsPointsOfInterests: false,
  showsBuildings: false,
  showsTraffic: false,
  showsIndoors: false,
  showsCompass: false,
  toolbarEnabled: false,
  pitchEnabled: false,
  rotateEnabled: false,
};

/** Les marqueurs dessinés en vue native doivent être capturés une fois, puis figés (sinon ils coûtent cher). */
export function useFrozenMarkers(deps: unknown[] = []) {
  const [track, setTrack] = useState(true);
  useEffect(() => {
    setTrack(true);
    const id = setTimeout(() => setTrack(false), 600);
    return () => clearTimeout(id);
  }, deps);
  return track;
}

/** Étiquette de lieu : petit carré noir sur le point, nom en blanc sur fond noir à côté. */
export function PlaceLabel({ lat, lon, name, side = 'right', strong = true, track, onPress, children }: {
  lat: number; lon: number; name: string; side?: 'left' | 'right'; strong?: boolean; track: boolean;
  onPress?: () => void; children?: ReactNode;
}) {
  return (
    <Marker
      coordinate={{ latitude: lat, longitude: lon }}
      anchor={{ x: side === 'right' ? 0 : 1, y: 0.5 }}
      tracksViewChanges={track}
      onPress={onPress}
    >
      <View style={[s.row, side === 'left' && { flexDirection: 'row-reverse' }]}>
        <View style={[s.square, !strong && s.squareSoft]} />
        <View style={[s.pointer, side === 'left' ? s.pointerLeft : s.pointerRight, !strong && s.pointerSoft]} />
        <View style={[s.box, !strong && s.boxSoft]}>
          <Text style={[s.text, !strong && s.textSoft]} numberOfLines={1}>{name}</Text>
          {children}
        </View>
      </View>
    </Marker>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  square: { width: 9, height: 9, backgroundColor: colors.ink, borderWidth: 1.5, borderColor: '#FFFFFF' },
  squareSoft: { width: 7, height: 7 },
  pointer: { width: 0, height: 0, borderTopWidth: 6, borderBottomWidth: 6, borderTopColor: 'transparent', borderBottomColor: 'transparent', marginHorizontal: 0 },
  pointerRight: { borderRightWidth: 7, borderRightColor: colors.ink, marginLeft: 4 },
  pointerLeft: { borderLeftWidth: 7, borderLeftColor: colors.ink, marginRight: 4 },
  pointerSoft: { borderRightColor: '#FFFFFF', borderLeftColor: '#FFFFFF' },
  box: { backgroundColor: colors.ink, paddingVertical: 4, paddingHorizontal: 8, maxWidth: 190, gap: 3 },
  boxSoft: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#D9D9D2' },
  text: { fontFamily: fonts.black, fontSize: 13, color: '#FFFFFF' },
  textSoft: { fontFamily: fonts.bold, fontSize: 12, color: colors.ink },
});
