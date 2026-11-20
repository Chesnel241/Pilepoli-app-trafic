import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../components/Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { fetchDepartures, fetchExits, fetchTraffic } from '../lib/api';
import { LEVEL, modeKey } from '../lib/lines';
import type { Exit, LineTraffic, RatedDeparture } from '../lib/types';
import { IconButton, LineBadge, StatusChip } from '../components/ui';
import { IconBack } from '../components/icons';
import { colors, fonts, radius } from '../theme';
import { anomalyLabel, depLabel, predictionLabel } from '../lib/labels';
import { useI18n } from '../lib/settings';
import type { Anomaly } from '../lib/types';

/** Un arrêt : ses prochains passages regroupés par ligne, l'info trafic qui le concerne, ses sorties. */
export default function Arret() {
  const { ref, area, name } = useLocalSearchParams<{ ref: string; area?: string; name?: string }>();
  const { t } = useI18n();
  const [deps, setDeps] = useState<RatedDeparture[] | null>(null);
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
  const [traffic, setTraffic] = useState<LineTraffic[]>([]);
  const [exits, setExits] = useState<Exit[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const snap = await fetchDepartures(String(ref));
    setDeps(snap.departures);
    setAnomalies(snap.anomalies ?? []);
    setFetchedAt(Date.parse(snap.fetchedAt));
  }, [ref]);

  useEffect(() => {
    load();
    const id = setInterval(load, 20_000);
    fetchTraffic().then((r) => setTraffic(r.lines)).catch(() => null);
    if (area) fetchExits(String(area)).then(setExits);
    else setExits([]);
    return () => clearInterval(id);
  }, [load, area]);

  // Regroupe par ligne + direction, dans l'ordre du premier passage.
  const groups = useMemo(() => {
    const m = new Map<string, RatedDeparture[]>();
    for (const d of deps ?? []) {
      const k = `${d.lineCode}|${d.destination}`;
      m.set(k, [...(m.get(k) ?? []), d]);
    }
    return [...m.values()].slice(0, 10);
  }, [deps]);

  // Perturbations des lignes qui passent ici.
  const alerts = useMemo(() => {
    const here = new Set((deps ?? []).map((d) => `${modeKey(d.mode ?? '', d.lineCode)}|${d.lineCode}`));
    return traffic.filter((l) => l.level !== 'ok' && here.has(`${modeKey(l.mode, l.code)}|${l.code}`));
  }, [deps, traffic]);

  const age = fetchedAt ? Math.max(0, Math.round((Date.now() - fetchedAt) / 1000)) : null;

  return (
    <SafeAreaView style={s.screen}>
      <View style={s.top}>
        <IconButton label={t('common.back')} onPress={() => router.back()}><IconBack /></IconButton>
      </View>
      <ScrollView
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={colors.violet} />}
      >
        <Text style={s.h1} accessibilityRole="header">{name || t('stop.title')}</Text>
        <Text style={s.fresh}>{age === null ? t('home.refreshing') : t('stop.updated', { n: age })}</Text>

        {alerts.map((l) => {
          const lv = LEVEL[l.level];
          return (
            <View key={l.lineId} style={[s.alert, { backgroundColor: lv.bg }]}>
              <LineBadge code={l.code} color={l.color} textColor={l.textColor} size={30} round={modeKey(l.mode, l.code) === 'metro'} />
              <Text style={[s.alertText, { color: lv.fg }]} numberOfLines={3}>{l.disruptions[0]?.title ?? t(`lvl.${l.level}`)}</Text>
            </View>
          );
        })}

        {anomalies.map((a, i) => (
          <View key={`${a.kind}-${i}`} style={s.anomaly}>
            <Text style={s.anomalyText}>{anomalyLabel(a)}</Text>
          </View>
        ))}

        {deps === null ? <ActivityIndicator color={colors.violet} style={{ marginTop: 20 }} /> : null}
        {deps && groups.length === 0 ? <Text style={s.empty}>{t('stop.none')}</Text> : null}

        {groups.map((list) => {
          const d = list[0];
          const pred = predictionLabel(d);
          return (
            <View key={`${d.lineCode}|${d.destination}`} style={s.group}>
              <LineBadge code={d.lineCode} color={d.lineColor ?? colors.violet} textColor={d.lineTextColor ?? '#FFFFFF'} round={d.mode === 'metro'} />
              <View style={{ flex: 1, gap: 6 }}>
                <Text style={s.dest} numberOfLines={1}>{d.destination}</Text>
                <StatusChip reliability={d.reliability} label={depLabel(d)} />
                {pred ? <Text style={s.pred}>{pred}</Text> : null}
              </View>
              <View style={s.times}>
                {list.slice(0, 3).map((x, i) => (
                  <Text key={x.journeyRef} style={[i === 0 ? s.timeMain : s.timeNext, x.reliability === 'supprime' && s.cancelled]}>
                    {x.reliability === 'supprime' ? t('stop.cancelled') : x.minutes === null || x.reliability === 'pas_vu' ? '?' : x.minutes <= 0 ? t('stop.atPlatform') : `${x.minutes}`}
                    {i === 0 && x.minutes !== null && x.minutes > 0 && x.reliability !== 'pas_vu' && x.reliability !== 'supprime' ? <Text style={s.unit}> {t('common.min')}</Text> : null}
                  </Text>
                ))}
              </View>
            </View>
          );
        })}

        {exits && exits.length > 0 ? (
          <View style={{ gap: 10, marginTop: 8 }}>
            <Text style={s.h2}>{t('stop.exits')}</Text>
            <View style={s.exits}>
              {exits.map((e) => (
                <View key={e.id} style={s.exit}>
                  <View style={s.exitNum}><Text style={s.exitNumText}>{e.number ?? '•'}</Text></View>
                  <Text style={s.exitName} numberOfLines={2}>{e.name}</Text>
                  {e.accessible ? <Text style={s.access} accessibilityLabel={t('common.accessible')}>♿</Text> : null}
                </View>
              ))}
            </View>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  top: { paddingHorizontal: 16, height: 52, justifyContent: 'center' },
  content: { paddingHorizontal: 20, paddingBottom: 40, gap: 14 },
  h1: { fontFamily: fonts.display, fontSize: 34, lineHeight: 37, color: colors.ink, letterSpacing: -0.8 },
  h2: { fontFamily: fonts.bold, fontSize: 18, color: colors.ink },
  fresh: { fontFamily: fonts.medium, fontSize: 14, color: colors.muted, marginTop: -6 },
  alert: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: radius.md, padding: 12 },
  alertText: { flex: 1, fontFamily: fonts.semi, fontSize: 14, lineHeight: 19 },
  anomaly: { backgroundColor: colors.amberBg, borderRadius: radius.md, padding: 12 },
  anomalyText: { fontFamily: fonts.semi, fontSize: 14, lineHeight: 19, color: colors.amberInk },
  pred: { fontFamily: fonts.medium, fontSize: 12, color: colors.muted },
  empty: { fontFamily: fonts.medium, fontSize: 16, color: colors.muted, marginTop: 12 },
  group: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.line },
  dest: { fontFamily: fonts.semi, fontSize: 16, color: colors.ink },
  times: { alignItems: 'flex-end', gap: 2 },
  timeMain: { fontFamily: fonts.display, fontSize: 26, color: colors.ink },
  timeNext: { fontFamily: fonts.semi, fontSize: 13, color: colors.muted },
  unit: { fontFamily: fonts.semi, fontSize: 15 },
  cancelled: { color: colors.redInk, textDecorationLine: 'line-through', fontSize: 15 },
  exits: { gap: 8 },
  exit: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.soft, borderRadius: 14, padding: 12 },
  exitNum: { minWidth: 34, height: 34, borderRadius: 10, backgroundColor: colors.lime, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  exitNumText: { fontFamily: fonts.display, fontSize: 17, color: colors.ink },
  exitName: { flex: 1, fontFamily: fonts.semi, fontSize: 15, color: colors.ink },
  access: { fontSize: 16 },
});
