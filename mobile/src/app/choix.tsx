import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { fetchJourneys } from '../lib/api';
import { hhmm, transitLegs, trip } from '../lib/trip';
import type { Journey } from '../lib/types';
import { IconButton, LineBadge, PulseDot, StatusChip } from '../components/ui';
import { IconBack } from '../components/icons';
import { colors, fonts, reliabilityStyle } from '../theme';

const RANK = { direct: 0, estime: 1, theorique: 2, pas_vu: 3, supprime: 4 } as const;

export default function Choix() {
  const { from, to, toName, fromName } = useLocalSearchParams<{ from: string; to: string; toName: string; fromName?: string }>();
  const [list, setList] = useState<Journey[] | null>(null);
  const [source, setSource] = useState('');

  useEffect(() => {
    fetchJourneys(from ?? '', to ?? '').then((r) => {
      // Le plus fiable d'abord, puis le plus rapide : c'est la promesse de Pilepoil.
      const sorted = [...r.journeys].sort((a, b) => RANK[a.reliability] - RANK[b.reliability] || a.durationMin - b.durationMin);
      trip.setOptions(sorted);
      setList(sorted);
      setSource(r.source);
      // Un seul trajet possible : pas de choix à faire, on passe directement au détail.
      if (sorted.length === 1) open(sorted[0].id, true);
    });
  }, [from, to]);

  const open = (id: string, replace = false) => {
    trip.select(id);
    replace ? router.replace('/trajet') : router.push('/trajet');
  };

  return (
    <SafeAreaView style={s.screen}>
      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <IconButton label="Retour" onPress={() => router.back()}><IconBack /></IconButton>
        <View style={{ gap: 4 }}>
          <Text style={s.from}>Depuis {fromName || 'ta position'}</Text>
          <Text style={s.h1}>{toName ?? 'Destination'}</Text>
        </View>

        {!list ? <ActivityIndicator color={colors.violet} style={{ marginTop: 40 }} /> : null}

        {list?.map((j, i) => {
          const best = i === 0;
          const r = reliabilityStyle[j.reliability];
          return (
            <Pressable key={j.id} onPress={() => open(j.id)} accessibilityRole="button"
              style={({ pressed }) => [s.card, best ? s.cardBest : s.cardOther, pressed && { opacity: 0.9 }]}>
              <View style={s.row}>
                {best ? <View style={s.tag}><Text style={s.tagText}>Le plus fiable</Text></View> : <Text style={s.alt}>{j.transfers === 0 ? 'Direct' : `${j.transfers} changement${j.transfers > 1 ? 's' : ''}`}</Text>}
                {best && j.reliability === 'direct'
                  ? <View style={s.row6}><PulseDot color={colors.lime} /><Text style={s.liveText}>Suivi en direct</Text></View>
                  : <StatusChip reliability={j.reliability} label={j.reliability === 'direct' ? 'En direct' : j.reliability === 'pas_vu' ? 'Trains pas vus' : j.reliability === 'estime' ? 'Estimé' : 'Horaire prévu'} />}
              </View>
              <View style={[s.row, { alignItems: 'flex-end' }]}>
                <Text style={[s.dur, best ? { color: '#FFFFFF', fontSize: 64 } : null]}>
                  {j.durationMin}<Text style={s.durUnit}> min</Text>
                </Text>
                <Text style={[s.arr, best && { color: colors.violetSoft }]}>arrivée {hhmm(j.arrivalAt)}</Text>
              </View>
              <View style={s.row6}>
                {transitLegs(j).map((l, k) => (
                  <View key={k} style={s.row6}>
                    {k > 0 ? <Text style={[s.sep, best && { color: colors.violetSoft }]}>›</Text> : null}
                    <LineBadge code={l.lineCode} color={l.lineColor} textColor={l.lineTextColor} size={36} />
                  </View>
                ))}
              </View>
              {j.reliability === 'pas_vu' ? (
                <Text style={[s.warn, { color: r.fg }]}>Dernière info disponible : aucun train suivi pour le moment. Tu peux attendre ou choisir une autre option.</Text>
              ) : null}
            </Pressable>
          );
        })}

        {source === 'local' || source === 'mock' ? (
          <Text style={s.note}>Données simulées : le moteur n'est pas encore branché sur PRIM.</Text>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 32, gap: 16 },
  from: { fontFamily: fonts.semi, fontSize: 15, color: colors.muted },
  h1: { fontFamily: fonts.display, fontSize: 36, color: colors.ink, letterSpacing: -1 },
  card: { borderRadius: 26, padding: 20, gap: 14 },
  cardBest: { backgroundColor: colors.violet },
  cardOther: { backgroundColor: colors.soft },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  row6: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tag: { backgroundColor: colors.lime, borderRadius: 999, paddingVertical: 5, paddingHorizontal: 12 },
  tagText: { fontFamily: fonts.black, fontSize: 13, color: colors.ink },
  alt: { fontFamily: fonts.bold, fontSize: 14, color: colors.muted },
  liveText: { fontFamily: fonts.bold, fontSize: 13, color: '#FFFFFF', marginLeft: 2 },
  dur: { fontFamily: fonts.display, fontSize: 44, color: colors.ink, lineHeight: 64 },
  durUnit: { fontFamily: fonts.bold, fontSize: 20 },
  arr: { fontFamily: fonts.semi, fontSize: 17, color: colors.muted, marginBottom: 10 },
  sep: { fontFamily: fonts.bold, fontSize: 20, color: colors.muted },
  warn: { fontFamily: fonts.medium, fontSize: 15, lineHeight: 21 },
  note: { fontFamily: fonts.medium, fontSize: 13, color: colors.muted, textAlign: 'center' },
});
