import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../components/Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { fetchJourneys } from '../lib/api';
import { hhmm, transitLegs, trip } from '../lib/trip';
import type { Journey } from '../lib/types';
import { IconButton, LineBadge, PulseDot, StatusChip } from '../components/ui';
import { IconBack } from '../components/icons';
import { colors, fonts, reliabilityStyle } from '../theme';
import { relLabel } from '../lib/labels';
import { useI18n } from '../lib/settings';

const RANK = { direct: 0, estime: 1, theorique: 2, pas_vu: 3, supprime: 4 } as const;

export default function Choix() {
  const { from, to, toName, fromName } = useLocalSearchParams<{ from: string; to: string; toName: string; fromName?: string }>();
  const [list, setList] = useState<Journey[] | null>(null);
  const [failure, setFailure] = useState<string | undefined>();
  const { t, tn } = useI18n();

  useEffect(() => {
    fetchJourneys(from ?? '', to ?? '').then((r) => {
      // Le plus fiable d'abord, puis le plus rapide : c'est la promesse de Pilepoil.
      const sorted = [...r.journeys].sort((a, b) => RANK[a.reliability] - RANK[b.reliability] || a.durationMin - b.durationMin);
      trip.setOptions(sorted);
      setList(sorted);
      setFailure(r.failure);
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
        <IconButton label={t('common.back')} onPress={() => router.back()}><IconBack /></IconButton>
        <View style={{ gap: 4 }}>
          <Text style={s.from}>{t('choice.from', { name: fromName || t('choice.yourPosition') })}</Text>
          <Text style={s.h1} accessibilityRole="header">{toName ?? t('home.destination')}</Text>
        </View>

        {!list ? <ActivityIndicator color={colors.violet} style={{ marginTop: 40 }} /> : null}
        {list && list.length === 0 ? (
          <Text style={s.warnPlain}>{failure === 'quota' ? t('err.quota') : failure === 'unavailable' ? t('err.unavailable') : failure === 'offline' ? t('home.offline') : t('choice.none')}</Text>
        ) : null}

        {list?.map((j, i) => {
          const best = i === 0;
          const r = reliabilityStyle[j.reliability];
          return (
            <Pressable key={j.id} onPress={() => open(j.id)} accessibilityRole="button"
              style={({ pressed }) => [s.card, best ? s.cardBest : s.cardOther, pressed && { opacity: 0.9 }]}>
              <View style={s.row}>
                {best ? <View style={s.tag}><Text style={s.tagText}>{t('choice.mostReliable')}</Text></View> : <Text style={s.alt}>{j.transfers === 0 ? t('choice.direct') : tn('choice.transfers', 'choice.transfersPlural', j.transfers)}</Text>}
                {best && j.reliability === 'direct'
                  ? <View style={s.row6}><PulseDot color={colors.lime} /><Text style={s.liveText}>{t('choice.liveTracked')}</Text></View>
                  : <StatusChip reliability={j.reliability} label={j.reliability === 'pas_vu' ? t('rel.trainsNotSeen') : relLabel(j.reliability)} />}
              </View>
              <View style={[s.row, { alignItems: 'flex-end' }]}>
                <Text style={[s.dur, best ? { color: '#FFFFFF', fontSize: 64 } : null]}>
                  {j.durationMin}<Text style={s.durUnit}> {t('common.min')}</Text>
                </Text>
                <Text style={[s.arr, best && { color: colors.violetSoft }]}>{t('choice.arrival', { time: hhmm(j.arrivalAt) })}</Text>
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
                <Text style={[s.warn, { color: r.fg }]}>{t('choice.notSeenWarn')}</Text>
              ) : null}
            </Pressable>
          );
        })}


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
  warnPlain: { fontFamily: fonts.semi, fontSize: 16, lineHeight: 22, color: colors.muted, marginTop: 12 },
  warn: { fontFamily: fonts.medium, fontSize: 15, lineHeight: 21 },
  note: { fontFamily: fonts.medium, fontSize: 13, color: colors.muted, textAlign: 'center' },
});
