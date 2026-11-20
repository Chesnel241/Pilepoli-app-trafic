import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Text, TextInput } from '../components/Text';
import { IconButton, LineBadge } from '../components/ui';
import { IconBack, IconSearch } from '../components/icons';
import { DepartureBoard } from '../components/DepartureBoard';
import { LineSheet, type SheetLine } from '../components/LineSheet';
import { fetchDepartures, fetchExits, fetchTraffic, searchPlaces } from '../lib/api';
import { cleanTitle } from '../lib/disruption';
import { LEVEL, modeKey } from '../lib/lines';
import { anomalyLabel } from '../lib/labels';
import { useI18n } from '../lib/settings';
import { trip } from '../lib/trip';
import type { Anomaly, Exit, LineTraffic, Place, RatedDeparture } from '../lib/types';
import { colors, fonts, radius } from '../theme';

/**
 * Une gare : « Tu vas où ? » d'abord (pour ne montrer que les passages qui s'y arrêtent),
 * puis les passages par ligne et par sens, l'info trafic des lignes qui passent ici, et les sorties.
 */
export default function Arret() {
  const params = useLocalSearchParams<{ ref: string; area?: string; name?: string; to?: string; toName?: string }>();
  const { ref, area, name } = params;
  const { t } = useI18n();

  // Destination : passée par l'écran précédent, ou déduite du trajet en cours s'il part d'ici.
  const fromTrip = useMemo(() => {
    const leg = trip.current()?.legs.find((l) => l.mode !== 'walk' && l.fromId && area && l.fromId.endsWith(`:${area}`));
    return leg?.toId ? { id: leg.toId, name: leg.to } : null;
  }, [area]);
  const [dest, setDest] = useState<{ id: string; name: string } | null>(params.to ? { id: params.to, name: params.toName ?? '' } : fromTrip);
  const [picking, setPicking] = useState(false);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Place[]>([]);

  const [deps, setDeps] = useState<RatedDeparture[] | null>(null);
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
  const [failure, setFailure] = useState<string | undefined>();
  const [traffic, setTraffic] = useState<LineTraffic[]>([]);
  const [exits, setExits] = useState<Exit[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [sheet, setSheet] = useState<SheetLine | null>(null);

  const load = useCallback(async () => {
    const snap = await fetchDepartures(String(ref), dest?.id);
    setDeps(snap.departures);
    setAnomalies(snap.anomalies ?? []);
    setFailure(snap.failure);
    setFetchedAt(Date.parse(snap.fetchedAt));
  }, [ref, dest?.id]);

  useEffect(() => {
    load();
    const id = setInterval(load, 20_000);
    return () => clearInterval(id);
  }, [load]);

  useEffect(() => {
    fetchTraffic().then((r) => setTraffic(r.lines)).catch(() => null);
    if (area) fetchExits(String(area)).then(setExits);
    else setExits([]);
  }, [area]);

  // Recherche de la gare de destination : seulement des gares et arrêts.
  useEffect(() => {
    if (!picking || q.trim().length < 2) return setResults([]);
    const id = setTimeout(async () => setResults((await searchPlaces(q)).filter((p) => p.kind === 'stop_area')), 300);
    return () => clearTimeout(id);
  }, [q, picking]);

  const alerts = useMemo(() => {
    const here = new Set((deps ?? []).map((d) => `${modeKey(d.mode ?? '', d.lineCode)}|${d.lineCode}`));
    return traffic.filter((l) => l.level !== 'ok' && l.level !== 'info' && here.has(`${modeKey(l.mode, l.code)}|${l.code}`));
  }, [deps, traffic]);

  const age = fetchedAt ? Math.max(0, Math.round((Date.now() - fetchedAt) / 1000)) : null;
  const shortDest = dest?.name.replace(/\s*\(.*\)$/, '') ?? '';

  return (
    <SafeAreaView style={s.screen}>
      <View style={s.top}>
        <IconButton label={t('common.back')} onPress={() => router.back()}><IconBack /></IconButton>
      </View>
      <ScrollView
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={colors.violet} />}
      >
        <Text style={s.h1} accessibilityRole="header">{name || t('stop.title')}</Text>
        <Text style={s.fresh}>{age === null ? t('home.refreshing') : t('stop.updated', { n: age })}</Text>

        {/* Tu vas où ? Le filtre qui évite de monter dans le mauvais train. */}
        {picking ? (
          <View style={{ gap: 8 }}>
            <View style={s.search}>
              <IconSearch />
              <TextInput value={q} onChangeText={setQ} autoFocus placeholder={t('stop.whereTo')} placeholderTextColor={colors.muted} style={s.input} returnKeyType="search" accessibilityLabel={t('stop.whereTo')} />
              <Pressable onPress={() => { setPicking(false); setQ(''); }} hitSlop={10} accessibilityRole="button"><Text style={s.link}>{t('home.cancel')}</Text></Pressable>
            </View>
            {results.length ? (
              <View style={s.results}>
                {results.map((p) => (
                  <Pressable key={p.id} onPress={() => { setDest({ id: p.id, name: p.name }); setPicking(false); setQ(''); setDeps(null); }} style={s.result} accessibilityRole="button">
                    <Text style={s.resultText}>{p.name}</Text>
                  </Pressable>
                ))}
              </View>
            ) : <Text style={s.hint}>{t('stop.whereToHint')}</Text>}
          </View>
        ) : dest ? (
          <View style={s.destRow}>
            <Pressable onPress={() => setPicking(true)} style={s.destChip} accessibilityRole="button">
              <Text style={s.destText} numberOfLines={1}>{t('stop.forDest', { name: shortDest })}</Text>
            </Pressable>
            <Pressable onPress={() => { setDest(null); setDeps(null); }} hitSlop={10} accessibilityRole="button"><Text style={s.link}>{t('stop.clearDest')}</Text></Pressable>
          </View>
        ) : (
          <Pressable onPress={() => setPicking(true)} style={s.whereTo} accessibilityRole="button">
            <IconSearch color={colors.lime} />
            <Text style={s.whereToText}>{t('stop.whereTo')}</Text>
          </Pressable>
        )}

        {alerts.map((l) => {
          const lv = LEVEL[l.level];
          const mk = modeKey(l.mode, l.code);
          return (
            <Pressable key={l.lineId} onPress={() => setSheet({ code: l.code, color: l.color, textColor: l.textColor, mode: mk, level: l.level, disruptions: l.disruptions })}
              style={[s.alert, { backgroundColor: lv.bg }]} accessibilityRole="button">
              <LineBadge code={l.code} color={l.color} textColor={l.textColor} size={30} round={mk === 'metro'} />
              <Text style={[s.alertText, { color: lv.fg }]} numberOfLines={2}>{cleanTitle(l.disruptions.find((d) => !d.upcoming)?.title ?? t(`lvl.${l.level}`))}</Text>
              <Text style={[s.chev, { color: lv.fg }]}>›</Text>
            </Pressable>
          );
        })}

        {anomalies.map((a, i) => (
          <View key={`${a.kind}-${i}`} style={s.anomaly}><Text style={s.anomalyText}>{anomalyLabel(a)}</Text></View>
        ))}

        {deps === null ? <ActivityIndicator color={colors.violet} style={{ marginTop: 20 }} /> : null}
        {deps && deps.length === 0 ? (
          <Text style={s.empty}>{failure === 'quota' ? t('err.quota') : failure === 'unavailable' ? t('err.unavailable') : failure === 'offline' ? t('home.offline') : t('stop.none')}</Text>
        ) : null}
        {deps && deps.length ? <DepartureBoard departures={deps} destName={dest ? shortDest : undefined} max={14} /> : null}

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
      <LineSheet line={sheet} onClose={() => setSheet(null)} />
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
  whereTo: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 56, borderRadius: 18, paddingHorizontal: 16, backgroundColor: colors.ink },
  whereToText: { fontFamily: fonts.display, fontSize: 19, color: colors.lime },
  search: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 56, paddingHorizontal: 16, borderRadius: 18, backgroundColor: colors.soft, borderWidth: 2, borderColor: colors.violet },
  input: { flex: 1, fontFamily: fonts.medium, fontSize: 18, color: colors.ink, paddingVertical: 12 },
  link: { fontFamily: fonts.bold, fontSize: 14, color: colors.violet },
  hint: { fontFamily: fonts.medium, fontSize: 14, lineHeight: 20, color: colors.muted },
  results: { borderRadius: radius.lg, backgroundColor: colors.soft, overflow: 'hidden' },
  result: { paddingVertical: 15, paddingHorizontal: 18, borderBottomWidth: 1, borderBottomColor: colors.line },
  resultText: { fontFamily: fonts.semi, fontSize: 17, color: colors.ink },
  destRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  destChip: { flexShrink: 1, backgroundColor: colors.lime, borderRadius: radius.pill, paddingVertical: 10, paddingHorizontal: 16 },
  destText: { fontFamily: fonts.black, fontSize: 16, color: colors.ink },
  alert: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: radius.md, padding: 12 },
  alertText: { flexShrink: 1, flexGrow: 1, fontFamily: fonts.semi, fontSize: 14, lineHeight: 19 },
  chev: { fontFamily: fonts.bold, fontSize: 20 },
  anomaly: { backgroundColor: colors.amberBg, borderRadius: radius.md, padding: 12 },
  anomalyText: { fontFamily: fonts.semi, fontSize: 14, lineHeight: 19, color: colors.amberInk },
  empty: { fontFamily: fonts.medium, fontSize: 16, lineHeight: 22, color: colors.muted, marginTop: 12 },
  exits: { gap: 8 },
  exit: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.soft, borderRadius: 14, padding: 12 },
  exitNum: { minWidth: 34, height: 34, borderRadius: 10, backgroundColor: colors.lime, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  exitNumText: { fontFamily: fonts.display, fontSize: 17, color: colors.ink },
  exitName: { flex: 1, fontFamily: fonts.semi, fontSize: 15, color: colors.ink },
  access: { fontSize: 16 },
});
