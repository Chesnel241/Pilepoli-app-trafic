import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, router } from 'expo-router';
import { guideStops, hhmm, trip } from '../lib/trip';
import { computeGuide, nextDemoInstant } from '../lib/guide';
import { IconButton, PulseDot } from '../components/ui';
import { IconClose } from '../components/icons';
import { TrainTrack } from '../components/TrainTrack';
import { colors, fonts } from '../theme';

/** Après Go : la consigne du moment en haut, tous les arrêts en dessous. Rien à toucher. */
export default function EnRoute() {
  const j = trip.current();
  const stops = useMemo(() => (j ? guideStops(j) : []), [j]);
  const [offset, setOffset] = useState(0); // décalage d'horloge pour la démo
  const [tick, setTick] = useState(Date.now());
  const leaving = useRef(false);

  useEffect(() => {
    const id = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const now = tick + offset;
  const state = computeGuide(stops, now);

  // Arrivé : l'écran Sortie s'ouvre tout seul.
  useEffect(() => {
    if (state.phase === 'arrived' && !leaving.current) {
      leaving.current = true;
      const id = setTimeout(() => router.replace('/arrivee'), 1500);
      return () => clearTimeout(id);
    }
  }, [state.phase]);

  if (!j) return <Redirect href="/" />;

  const demo = () => {
    const nxt = nextDemoInstant(stops, now);
    if (nxt) setOffset(nxt - Date.now());
  };

  const c = state.card;
  return (
    <SafeAreaView style={s.screen}>
      <ScrollView contentContainerStyle={s.content}>
        <View style={s.top}>
          <IconButton label="Quitter le guidage" onPress={() => router.back()}><IconClose /></IconButton>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={s.arrLabel}>Arrivée</Text>
            <Text style={s.arr}>{hhmm(j.arrivalAt)}</Text>
          </View>
        </View>

        <View style={s.card} accessibilityLiveRegion="polite">
          <View style={s.cardHead}>
            <View style={s.row}>
              <View style={[s.badge, { backgroundColor: c.badgeColor }]}><Text style={[s.badgeText, { color: c.badgeText }]}>{c.badge}</Text></View>
              <Text style={s.kicker} numberOfLines={1}>{c.kicker}</Text>
            </View>
            <View style={s.row}><PulseDot color={colors.lime} /><Text style={s.live}>en direct</Text></View>
          </View>
          <Text style={s.title}>{c.title}</Text>
          <Text style={s.sub}>{c.sub}</Text>
          <View style={s.bar}><View style={[s.barFill, { width: `${Math.round(c.pct * 100)}%` }]} /></View>
        </View>

        <TrainTrack stops={stops} state={state} now={now} />

        <Pressable onPress={demo} style={s.demo} accessibilityRole="button">
          <Text style={s.demoText}>Démo : faire avancer le trajet</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 18, gap: 18 },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  arrLabel: { fontFamily: fonts.semi, fontSize: 13, color: colors.muted },
  arr: { fontFamily: fonts.display, fontSize: 24, color: colors.ink },
  card: { backgroundColor: colors.ink, borderRadius: 28, padding: 18, gap: 10 },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  badge: { width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontFamily: fonts.black, fontSize: 18 },
  kicker: { fontFamily: fonts.semi, fontSize: 14, color: '#D7D7DE', flexShrink: 1 },
  live: { fontFamily: fonts.bold, fontSize: 12, color: colors.lime },
  title: { fontFamily: fonts.display, fontSize: 32, color: '#FFFFFF', lineHeight: 34, letterSpacing: -0.5 },
  sub: { fontFamily: fonts.semi, fontSize: 16, color: colors.lime },
  bar: { height: 6, borderRadius: 3, backgroundColor: '#2A2C33', overflow: 'hidden' },
  barFill: { height: 6, borderRadius: 3, backgroundColor: colors.lime },
  demo: { alignSelf: 'center', height: 42, paddingHorizontal: 18, borderRadius: 999, borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#C9C9D3', justifyContent: 'center' },
  demoText: { fontFamily: fonts.semi, fontSize: 14, color: colors.muted },
});
