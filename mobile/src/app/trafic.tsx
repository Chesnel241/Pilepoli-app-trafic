import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Text, TextInput } from '../components/Text';
import { BottomNav, LineBadge } from '../components/ui';
import { LineSheet, type SheetLine } from '../components/LineSheet';
import { fetchLines, fetchTraffic } from '../lib/api';
import { cleanTitle, lineName } from '../lib/disruption';
import { LEVEL, METRO, RER, modeKey, type ModeKey } from '../lib/lines';
import type { Key } from '../lib/i18n';
import { useI18n } from '../lib/settings';
import type { LineTraffic, NetworkLine, TrafficLevel, TrafficReport } from '../lib/types';
import { colors, fonts, radius } from '../theme';

type Filter = 'tout' | ModeKey;
const FILTERS: [Filter, Key][] = [
  ['tout', 'traffic.all'], ['metro', 'traffic.metro'], ['rer', 'traffic.rer'], ['train', 'traffic.train'],
  ['tram', 'traffic.tram'], ['bus', 'traffic.bus'],
];
const SECTIONS: ModeKey[] = ['metro', 'rer', 'train', 'tram', 'cable'];
const SECTION_LABEL: Record<ModeKey, Key> = { metro: 'traffic.metro', rer: 'traffic.rer', train: 'traffic.train', tram: 'traffic.tram', cable: 'traffic.cable', bus: 'traffic.bus' };
const RANK: Record<TrafficLevel, number> = { interrompu: 0, perturbe: 1, travaux: 2, info: 3, ok: 4 };
const natural = (a: string, b: string) => a.localeCompare(b, 'fr', { numeric: true, sensitivity: 'base' });

interface Tile { key: string; code: string; color: string; textColor: string; mode: ModeKey; traffic?: LineTraffic }

/**
 * L'état du réseau en un coup d'œil : une petite carte par ligne, pour chaque mode.
 * La couleur de fond et un mot disent l'état (jamais la couleur seule). Un tap ouvre le détail lisible.
 */
export default function Trafic() {
  const { t } = useI18n();
  const [report, setReport] = useState<TrafficReport | null>(null);
  const [network, setNetwork] = useState<NetworkLine[]>([]);
  const [filter, setFilter] = useState<Filter>('tout');
  const [sheet, setSheet] = useState<SheetLine | null>(null);
  const [bus, setBus] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [, tick] = useState(0);

  const load = useCallback(async () => setReport(await fetchTraffic()), []);
  useEffect(() => {
    load();
    fetchLines().then(setNetwork);
    const id = setInterval(load, 60_000);
    const tk = setInterval(() => tick((x) => x + 1), 10_000);
    return () => { clearInterval(id); clearInterval(tk); };
  }, [load]);

  const refresh = async () => {
    setRefreshing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null);
    await load();
    setRefreshing(false);
  };

  // Lignes du réseau (référentiel), avec leur état. Sans référentiel : les grandes lignes connues.
  const byMode = useMemo(() => {
    const traffic = new Map<string, LineTraffic>();
    for (const l of report?.lines ?? []) {
      traffic.set(l.lineId, l);
      traffic.set(`${modeKey(l.mode, l.code)}|${l.code}`, l);
    }
    const base: Tile[] = network.length
      ? network.map((n) => ({ key: n.id, code: n.code, color: n.color, textColor: n.textColor, mode: modeKey(n.mode, n.code), traffic: traffic.get(n.id) }))
      : [...METRO.map(([c, col, tc]) => ({ key: `m${c}`, code: c, color: col, textColor: tc, mode: 'metro' as ModeKey })),
        ...RER.map(([c, col, tc]) => ({ key: `r${c}`, code: c, color: col, textColor: tc, mode: 'rer' as ModeKey }))];
    const out: Record<ModeKey, Tile[]> = { metro: [], rer: [], train: [], tram: [], cable: [], bus: [] };
    for (const tl of base) out[tl.mode].push({ ...tl, traffic: tl.traffic ?? traffic.get(`${tl.mode}|${tl.code}`) });
    // Bus : seulement ceux qui ont une info, plus la ligne cherchée (il y en a plus de 1 500).
    for (const l of report?.lines ?? []) {
      if (modeKey(l.mode, l.code) === 'bus' && l.level !== 'ok') out.bus.push({ key: l.lineId, code: l.code, color: l.color, textColor: l.textColor, mode: 'bus', traffic: l });
    }
    for (const k of Object.keys(out) as ModeKey[]) out[k].sort((a, b) => natural(a.code, b.code));
    out.bus.sort((a, b) => RANK[a.traffic?.level ?? 'ok'] - RANK[b.traffic?.level ?? 'ok'] || natural(a.code, b.code));
    return out;
  }, [network, report]);

  const shown = filter === 'tout' ? SECTIONS : [filter];
  const watch = shown.flatMap((m) => byMode[m]).filter((x) => x.traffic && (x.traffic.level === 'perturbe' || x.traffic.level === 'interrompu'))
    .sort((a, b) => RANK[a.traffic!.level] - RANK[b.traffic!.level]);
  const headline = !report ? t('traffic.looking') : watch.length === 0 ? t('traffic.allGood') : watch.length === 1 ? t('traffic.oneBig') : t('traffic.manyBig', { n: watch.length });
  const age = report ? Math.max(0, Math.round((Date.now() - Date.parse(report.fetchedAt)) / 1000)) : null;

  const open = (tl: Tile) => setSheet({
    code: tl.code, color: tl.color, textColor: tl.textColor, mode: tl.mode,
    level: tl.traffic?.level ?? 'ok', disruptions: tl.traffic?.disruptions ?? [],
  });

  const busQuery = bus.trim().toUpperCase();
  const busFound = busQuery ? (report?.lines ?? []).filter((l) => modeKey(l.mode, l.code) === 'bus' && l.code.toUpperCase() === busQuery) : [];

  return (
    <SafeAreaView style={s.screen} edges={['top']}>
      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.violet} />}>
        <Text style={s.h1} accessibilityRole="header">{headline}</Text>
        <Text style={s.fresh}>{age === null ? '' : age < 60 ? t('traffic.updatedS', { n: age }) : t('traffic.updatedM', { n: Math.round(age / 60) })}</Text>

        {report?.error ? (
          <View style={s.notice}><Text style={s.noticeText}>
            {report.error === 'abonnement' ? t('traffic.subscription') : report.error === 'offline' ? t('home.offline') : report.error === 'quota' ? t('err.quota') : t('traffic.unavailable')}
          </Text></View>
        ) : null}

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filters}>
          {FILTERS.map(([k, labelKey]) => (
            <Pressable key={k} onPress={() => setFilter(k)} style={[s.filter, filter === k && s.filterOn]} accessibilityRole="button" accessibilityState={{ selected: filter === k }}>
              <Text style={[s.filterText, filter === k && s.filterTextOn]}>{t(labelKey)}</Text>
            </Pressable>
          ))}
        </ScrollView>

        {/* À surveiller : les lignes perturbées, avec la raison en une ligne. */}
        {filter !== 'bus' && watch.length ? (
          <View style={{ gap: 8 }}>
            {watch.slice(0, 6).map((tl) => {
              const lv = LEVEL[tl.traffic!.level];
              return (
                <Pressable key={tl.key} onPress={() => open(tl)} style={[s.watch, { backgroundColor: lv.bg }]} accessibilityRole="button">
                  <LineBadge code={tl.code} color={tl.color} textColor={tl.textColor} size={36} round={tl.mode === 'metro'} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={[s.watchLevel, { color: lv.fg }]}>{lineName(tl.code, tl.mode)} · {t(`lvl.${tl.traffic!.level}`)}</Text>
                    <Text style={s.watchTitle} numberOfLines={2}>{cleanTitle(tl.traffic!.disruptions.find((d) => !d.upcoming)?.title ?? '')}</Text>
                  </View>
                  <Text style={s.chev}>›</Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}

        {filter === 'bus' ? (
          <View style={{ gap: 12 }}>
            <Text style={s.gridTitle}>{t('traffic.busSearch')}</Text>
            <TextInput value={bus} onChangeText={setBus} placeholder={t('traffic.busHint')} placeholderTextColor={colors.muted}
              style={s.search} autoCapitalize="characters" autoCorrect={false} returnKeyType="search" accessibilityLabel={t('traffic.busSearch')} />
            {busQuery ? (
              busFound.length ? (
                <Grid tiles={busFound.map((l) => ({ key: l.lineId, code: l.code, color: l.color, textColor: l.textColor, mode: 'bus' as ModeKey, traffic: l }))} onOpen={open} />
              ) : <View style={s.ok}><Text style={s.okText}>{t('traffic.busOk', { code: busQuery })}</Text></View>
            ) : null}
            {byMode.bus.length ? <Text style={s.gridTitle}>{t('traffic.busTroubled')}</Text> : null}
            <Grid tiles={byMode.bus} onOpen={open} />
          </View>
        ) : (
          shown.map((m) => byMode[m].length ? (
            <View key={m} style={{ gap: 10 }}>
              <Text style={s.gridTitle}>{t(SECTION_LABEL[m])}</Text>
              <Grid tiles={byMode[m]} onOpen={open} />
            </View>
          ) : null)
        )}

        <View style={s.legend}>
          {(['ok', 'travaux', 'perturbe', 'interrompu'] as const).map((k) => (
            <View key={k} style={s.legendItem}><View style={[s.legendDot, { backgroundColor: LEVEL[k].dot }]} /><Text style={s.legendText}>{t(`lvl.${k}`)}</Text></View>
          ))}
        </View>
      </ScrollView>
      <LineSheet line={sheet} onClose={() => setSheet(null)} />
      <BottomNav active="trafic" />
    </SafeAreaView>
  );
}

/** Petites cartes de ligne : badge, et l'état écrit dessous. */
function Grid({ tiles, onOpen }: { tiles: Tile[]; onOpen: (t: Tile) => void }) {
  const { t } = useI18n();
  return (
    <View style={s.grid}>
      {tiles.map((tl) => {
        const level = tl.traffic?.level ?? 'ok';
        const lv = LEVEL[level];
        const calm = level === 'ok' || level === 'info';
        return (
          <Pressable key={tl.key} onPress={() => onOpen(tl)} style={({ pressed }) => [s.tile, !calm && { backgroundColor: lv.bg, borderColor: lv.bg }, pressed && { opacity: 0.7 }]}
            accessibilityRole="button" accessibilityLabel={`${lineName(tl.code, tl.mode)} : ${t(`lvl.${level}`)}`}>
            <LineBadge code={tl.code} color={tl.color} textColor={tl.textColor} size={38} round={tl.mode === 'metro'} />
            <View style={s.tileState}>
              <View style={[s.tileDot, { backgroundColor: lv.dot }]} />
              <Text style={[s.tileText, !calm && { color: lv.fg }]} numberOfLines={1}>{t(`lvl.${level}`)}</Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 120, gap: 16 },
  h1: { fontFamily: fonts.display, fontSize: 34, lineHeight: 37, color: colors.ink, letterSpacing: -1 },
  fresh: { fontFamily: fonts.medium, fontSize: 14, color: colors.muted, marginTop: -8 },
  notice: { backgroundColor: colors.amberBg, borderRadius: radius.md, padding: 14 },
  noticeText: { fontFamily: fonts.semi, fontSize: 14, lineHeight: 20, color: colors.amberInk },
  filters: { gap: 8 },
  filter: { paddingVertical: 9, paddingHorizontal: 16, borderRadius: radius.pill, backgroundColor: colors.soft },
  filterOn: { backgroundColor: colors.ink },
  filterText: { fontFamily: fonts.bold, fontSize: 14, color: colors.ink },
  filterTextOn: { color: '#FFFFFF' },
  watch: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 18, padding: 12 },
  watchLevel: { fontFamily: fonts.black, fontSize: 13 },
  watchTitle: { fontFamily: fonts.semi, fontSize: 15, lineHeight: 20, color: colors.ink },
  chev: { fontFamily: fonts.bold, fontSize: 22, color: colors.muted },
  gridTitle: { fontFamily: fonts.bold, fontSize: 13, color: colors.muted, letterSpacing: 1, textTransform: 'uppercase' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tile: { width: '23%', minWidth: 74, flexGrow: 1, maxWidth: '25%', alignItems: 'center', gap: 6, paddingVertical: 10, paddingHorizontal: 4, borderRadius: 16, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: colors.line },
  tileState: { flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: '100%' },
  tileDot: { width: 7, height: 7, borderRadius: 4 },
  tileText: { fontFamily: fonts.bold, fontSize: 11, color: colors.muted, flexShrink: 1 },
  search: { minHeight: 54, borderRadius: 16, backgroundColor: colors.soft, paddingHorizontal: 16, fontFamily: fonts.bold, fontSize: 20, color: colors.ink, borderWidth: 1, borderColor: colors.line },
  ok: { backgroundColor: '#E7F7D9', borderRadius: radius.md, padding: 14 },
  okText: { fontFamily: fonts.semi, fontSize: 15, color: '#1F5E14' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontFamily: fonts.semi, fontSize: 13, color: '#3A3D46' },
});
