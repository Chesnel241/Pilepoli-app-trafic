import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { CloseButton, FullModal } from './FullModal';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Text } from './Text';
import { DepartureBoard } from './DepartureBoard';
import { fetchDepartures } from '../lib/api';
import { t } from '../lib/i18n';
import type { NearbyStop, RatedDeparture } from '../lib/types';
import { colors, fonts, radius } from '../theme';

/** Feuille d'une station touchée sur la carte : tous ses passages, par ligne et par sens, mis à jour en direct. */
export function StationSheet({ stop, onClose, onLeave }: { stop: NearbyStop | null; onClose: () => void; onLeave?: () => void }) {
  const [deps, setDeps] = useState<RatedDeparture[] | null>(null);

  useEffect(() => {
    if (!stop) return;
    setDeps(stop.departures.length ? stop.departures : null);
    let alive = true;
    const load = async () => {
      const snap = await fetchDepartures(stop.stopRef);
      if (alive && snap.source !== 'offline') setDeps(snap.departures);
    };
    load();
    const id = setInterval(load, 20_000);
    return () => { alive = false; clearInterval(id); };
  }, [stop?.stopRef]);

  if (!stop) return null;
  // À plus de 80 m : on propose d'y aller à pied, avec le GPS piéton.
  const far = stop.distance > 80;
  const walk = () => {
    onClose();
    onLeave?.();
    router.push({ pathname: '/marche', params: { to: stop.placeId, name: stop.name, area: stop.areaNumber, ...(stop.lat !== undefined ? { lat: String(stop.lat), lon: String(stop.lon) } : {}) } });
  };
  const openStop = () => {
    onClose();
    onLeave?.();
    router.push({ pathname: '/arret', params: { ref: stop.stopRef, area: stop.areaNumber, name: stop.name, place: stop.placeId, dist: String(stop.distance), ...(stop.lat !== undefined ? { lat: String(stop.lat), lon: String(stop.lon) } : {}) } });
  };

  return (
    <FullModal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose} accessibilityLabel={t('common.close')} />
      <SafeAreaView edges={['bottom']} style={s.sheet}>
        <View style={s.grabber} />
        <View style={s.head}>
          <View style={{ flex: 1 }}>
            <Text style={s.name} accessibilityRole="header" numberOfLines={2}>{stop.name}</Text>
            <Text style={s.sub}>{t('home.walk', { n: Math.max(1, Math.round(stop.distance / 80)) })}</Text>
          </View>
          <Pressable onPress={openStop} style={s.all} accessibilityRole="button">
            <Text style={s.allText}>{t('stop.seeAll')} ›</Text>
          </Pressable>
        </View>
        {far ? (
          <Pressable onPress={walk} style={s.walk} accessibilityRole="button">
            <Text style={s.walkText}>🚶 {t('walk.go')} · {t('walk.minWalk', { n: Math.max(1, Math.round(stop.distance / 75)) })}</Text>
          </Pressable>
        ) : null}
        <ScrollView contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>
          {deps === null ? <ActivityIndicator color={colors.violet} /> : deps.length === 0 ? <Text style={s.empty}>{t('stop.none')}</Text> : <DepartureBoard departures={deps} max={8} />}
        </ScrollView>
      </SafeAreaView>
    </FullModal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(14,15,18,0.35)' },
  sheet: { maxHeight: '78%', backgroundColor: colors.bg, borderTopLeftRadius: 30, borderTopRightRadius: 30, paddingTop: 8 },
  grabber: { alignSelf: 'center', width: 44, height: 5, borderRadius: 3, backgroundColor: '#D9D9E0', marginBottom: 10 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingBottom: 12 },
  name: { fontFamily: fonts.display, fontSize: 26, lineHeight: 29, color: colors.ink },
  sub: { fontFamily: fonts.semi, fontSize: 14, color: colors.muted },
  all: { backgroundColor: colors.ink, borderRadius: radius.pill, paddingVertical: 10, paddingHorizontal: 14 },
  allText: { fontFamily: fonts.black, fontSize: 14, color: colors.lime },
  walk: { marginHorizontal: 20, marginBottom: 12, minHeight: 52, borderRadius: radius.pill, backgroundColor: colors.lime, alignItems: 'center', justifyContent: 'center' },
  walkText: { fontFamily: fonts.black, fontSize: 16, color: colors.ink },
  body: { paddingHorizontal: 20, paddingBottom: 20, gap: 12 },
  empty: { fontFamily: fonts.medium, fontSize: 16, color: colors.muted },
});
