import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../components/Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { fetchTraffic } from '../lib/api';
import { LEVEL, METRO, RER, modeKey } from '../lib/lines';
import type { LineTraffic, TrafficReport } from '../lib/types';
import { BottomNav, LineBadge } from '../components/ui';
import { colors, fonts, radius } from '../theme';
import type { Key } from '../lib/i18n';
import { useI18n } from '../lib/settings';
import { getLang, localeTag, t as tr } from '../lib/i18n';

type Filter = 'tout' | 'metro' | 'rer' | 'tram' | 'bus';
const FILTERS: [Filter, Key][] = [['tout', 'traffic.all'], ['metro', 'traffic.metro'], ['rer', 'traffic.rer'], ['tram', 'traffic.tram'], ['bus', 'traffic.bus']];

/** L'état du réseau : d'abord ce qui ne va pas, puis la grille des grandes lignes. */
export default function Trafic() {
  const { t, tn } = useI18n();
  const [report, setReport] = useState<TrafficReport | null>(null);
  const [filter, setFilter] = useState<Filter>('tout');
  const [open, setOpen] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [, tick] = useState(0);

  const load = useCallback(async () => setReport(await fetchTraffic()), []);
  useEffect(() => {
    load();
    const id = setInterval(load, 60_000);
    const t = setInterval(() => tick((x) => x + 1), 10_000);
    return () => { clearInterval(id); clearInterval(t); };
  }, [load]);

  const refresh = async () => {
    setRefreshing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null);
    await load();
    setRefreshing(false);
  };

  const lines = report?.lines ?? [];
  const troubled = useMemo(
    () => lines.filter((l) => l.level !== 'ok' && l.level !== 'info' && (filter === 'tout' || modeKey(l.mode, l.code) === filter)),
    [lines, filter],
  );
  const byCode = useMemo(() => {
    const m = new Map<string, LineTraffic>();
    for (const l of lines) if (modeKey(l.mode, l.code) === 'metro' || modeKey(l.mode, l.code) === 'rer') m.set(l.code, l);
    return m;
  }, [lines]);

  const big = troubled.filter((l) => ['metro', 'rer'].includes(modeKey(l.mode, l.code))).length;
  const headline = !report ? t('traffic.looking') : big === 0 ? t('traffic.allGood') : big === 1 ? t('traffic.oneBig') : t('traffic.manyBig', { n: big });
  const age = report ? Math.max(0, Math.round((Date.now() - Date.parse(report.fetchedAt)) / 1000)) : null;

  return (
    <SafeAreaView style={s.screen} edges={['top']}>
      <ScrollView
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.violet} />}
      >
        <Text style={s.h1}>{headline}</Text>
        <Text style={s.fresh}>
          {age === null ? '' : age < 60 ? t('traffic.updatedS', { n: age }) : t('traffic.updatedM', { n: Math.round(age / 60) })}
        </Text>

        {report?.error === 'abonnement' ? (
          <View style={s.notice}>
            <Text style={s.noticeText}>{t('traffic.subscription')}</Text>
          </View>
        ) : report?.error ? (
          <View style={s.notice}><Text style={s.noticeText}>{report.error === 'offline' ? t('home.offline') : report.error === 'quota' ? t('err.quota') : t('traffic.unavailable')}</Text></View>
        ) : null}

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filters}>
          {FILTERS.map(([k, labelKey]) => (
            <Pressable key={k} onPress={() => setFilter(k)} style={[s.filter, filter === k && s.filterOn]} accessibilityRole="button" accessibilityState={{ selected: filter === k }}>
              <Text style={[s.filterText, filter === k && s.filterTextOn]}>{t(labelKey)}</Text>
            </Pressable>
          ))}
        </ScrollView>

        {troubled.length === 0 && report ? (
          <View style={s.allGood}><Text style={s.allGoodText}>{t('traffic.nothing')}</Text></View>
        ) : null}

        {troubled.map((l) => {
          const lv = LEVEL[l.level];
          const d = l.disruptions[0];
          const isOpen = open === l.lineId;
          return (
            <Pressable key={l.lineId} onPress={() => setOpen(isOpen ? null : l.lineId)} style={s.card} accessibilityRole="button" accessibilityState={{ expanded: isOpen }}>
              <View style={s.cardHead}>
                <LineBadge code={l.code} color={l.color} textColor={l.textColor} size={40} round={modeKey(l.mode, l.code) === 'metro'} />
                <View style={{ flex: 1, gap: 4 }}>
                  <View style={[s.level, { backgroundColor: lv.bg }]}><Text style={[s.levelText, { color: lv.fg }]}>{t(`lvl.${l.level}`)}</Text></View>
                  <Text style={s.cardTitle} numberOfLines={isOpen ? undefined : 2}>{d?.title}</Text>
                </View>
              </View>
              {isOpen ? (
                <View style={{ gap: 10 }}>
                  {l.disruptions.map((x) => (
                    <View key={x.id} style={{ gap: 4 }}>
                      {l.disruptions.length > 1 ? <Text style={s.subTitle}>{x.title}</Text> : null}
                      {x.message ? <Text style={s.msg}>{x.message}</Text> : null}
                      {x.end ? <Text style={s.until}>{t('traffic.until', { date: fmt(x.end) })}</Text> : null}
                    </View>
                  ))}
                </View>
              ) : l.disruptions.length > 1 ? <Text style={s.more}>{tn('traffic.more', 'traffic.morePlural', l.disruptions.length - 1)}</Text> : null}
            </Pressable>
          );
        })}

        {filter === 'tout' || filter === 'metro' ? <Grid title={t('traffic.metro')} list={METRO} byCode={byCode} round /> : null}
        {filter === 'tout' || filter === 'rer' ? <Grid title={t('traffic.rer')} list={RER} byCode={byCode} /> : null}

        {getLang() === 'en' && troubled.length ? <Text style={s.fresh}>{t('traffic.frenchOnly')}</Text> : null}
        <View style={s.legend}>
          {(['ok', 'travaux', 'perturbe'] as const).map((k) => (
            <View key={k} style={s.legendItem}><View style={[s.legendDot, { backgroundColor: LEVEL[k].dot }]} /><Text style={s.legendText}>{t(`lvl.${k}`)}</Text></View>
          ))}
        </View>
      </ScrollView>
      <BottomNav active="trafic" />
    </SafeAreaView>
  );
}

function Grid({ title, list, byCode, round = false }: {
  title: string; list: readonly (readonly [string, string, string])[]; byCode: Map<string, LineTraffic>; round?: boolean;
}) {
  return (
    <View style={{ gap: 10 }}>
      <Text style={s.gridTitle}>{title}</Text>
      <View style={s.grid}>
        {list.map(([code, color, text]) => {
          const tl = byCode.get(code);
          const lv = LEVEL[tl?.level ?? 'ok'];
          return (
            <View key={code} style={s.cell} accessibilityLabel={`${title} ${code} : ${tr(`lvl.${tl?.level ?? 'ok'}`)}`}>
              <LineBadge code={code} color={color} textColor={text} size={40} round={round} />
              <View style={[s.cellDot, { backgroundColor: lv.dot }]} />
            </View>
          );
        })}
      </View>
    </View>
  );
}

const fmt = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleDateString(localeTag(), { day: 'numeric', month: 'long' }) + `${getLang() === 'en' ? ',' : ' à'} ${String(d.getHours()).padStart(2, '0')}${getLang() === 'en' ? ':' : 'h'}${String(d.getMinutes()).padStart(2, '0')}`;
};

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 120, gap: 16 },
  h1: { fontFamily: fonts.display, fontSize: 38, lineHeight: 40, color: colors.ink, letterSpacing: -1 },
  fresh: { fontFamily: fonts.medium, fontSize: 14, color: colors.muted, marginTop: -8 },
  notice: { backgroundColor: colors.amberBg, borderRadius: radius.md, padding: 14 },
  noticeText: { fontFamily: fonts.semi, fontSize: 14, lineHeight: 20, color: colors.amberInk },
  filters: { gap: 8 },
  filter: { paddingVertical: 9, paddingHorizontal: 16, borderRadius: radius.pill, backgroundColor: colors.soft },
  filterOn: { backgroundColor: colors.ink },
  filterText: { fontFamily: fonts.bold, fontSize: 14, color: colors.ink },
  filterTextOn: { color: '#FFFFFF' },
  allGood: { backgroundColor: '#E7F7D9', borderRadius: radius.md, padding: 16 },
  allGoodText: { fontFamily: fonts.semi, fontSize: 15, color: '#1F5E14' },
  card: { backgroundColor: colors.soft, borderRadius: 20, padding: 14, gap: 12 },
  cardHead: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  level: { alignSelf: 'flex-start', borderRadius: radius.pill, paddingVertical: 3, paddingHorizontal: 9 },
  levelText: { fontFamily: fonts.black, fontSize: 12 },
  cardTitle: { fontFamily: fonts.bold, fontSize: 16, lineHeight: 21, color: colors.ink },
  subTitle: { fontFamily: fonts.bold, fontSize: 14, color: colors.ink },
  msg: { fontFamily: fonts.medium, fontSize: 15, lineHeight: 21, color: '#3A3D46' },
  until: { fontFamily: fonts.semi, fontSize: 13, color: colors.muted },
  more: { fontFamily: fonts.semi, fontSize: 13, color: colors.violet },
  gridTitle: { fontFamily: fonts.bold, fontSize: 14, color: colors.muted, letterSpacing: 1 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  cell: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  cellDot: { position: 'absolute', right: -2, top: -2, width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: '#FFFFFF' },
  legend: { flexDirection: 'row', gap: 16 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontFamily: fonts.semi, fontSize: 13, color: '#3A3D46' },
});
