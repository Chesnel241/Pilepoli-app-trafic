import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Text } from './Text';
import { LineCloud } from './LineCloud';
import { LineSheet, type SheetLine } from './LineSheet';
import { LEVEL, modeKey, type ModeKey } from '../lib/lines';
import { t } from '../lib/i18n';
import type { LineTraffic, NearbyStop, TrafficReport } from '../lib/types';
import { colors, fonts, radius } from '../theme';

const RANK = { interrompu: 0, perturbe: 1, travaux: 2, info: 3, ok: 4 } as const;

interface NearLine { key: string; code: string; color: string; textColor: string; mode: ModeKey; traffic?: LineTraffic }

/**
 * Le tableau de bord de l'accueil : l'état des lignes qui passent autour de toi, en un coup d'œil.
 * D'abord ce qui ne va pas, puis le reste. Une ligne perturbée se touche pour lire le message.
 */
export function NetworkDashboard({ nearby, report }: { nearby: NearbyStop[] | null; report: TrafficReport | null }) {
  const [sheet, setSheet] = useState<SheetLine | null>(null);

  const lines = useMemo<NearLine[]>(() => {
    if (!nearby) return [];
    const seen = new Map<string, NearLine>();
    for (const st of nearby) for (const d of st.departures) {
      const mk = modeKey(d.mode ?? '', d.lineCode);
      const key = `${mk}|${d.lineCode}`;
      if (seen.has(key)) continue;
      const tr = report?.lines.find((l) => l.code === d.lineCode && modeKey(l.mode, l.code) === mk);
      seen.set(key, { key, code: d.lineCode, color: d.lineColor ?? tr?.color ?? colors.violet, textColor: d.lineTextColor ?? tr?.textColor ?? '#FFFFFF', mode: mk, traffic: tr });
    }
    return [...seen.values()].sort((a, b) => RANK[a.traffic?.level ?? 'ok'] - RANK[b.traffic?.level ?? 'ok']).slice(0, 12);
  }, [nearby, report]);

  const bad = lines.filter((l) => l.traffic && (l.traffic.level === 'perturbe' || l.traffic.level === 'interrompu'));
  const works = lines.filter((l) => l.traffic?.level === 'travaux');
  const known = !!report && !report.error;
  const headline = nearby === null || !report ? t('dash.loading')
    : lines.length === 0 ? t('dash.noLines')
    : bad.length === 1 ? t('dash.oneBad', { line: label(bad[0]) })
    : bad.length > 1 ? t('dash.manyBad', { n: bad.length })
    : works.length ? t('dash.works', { line: works.map(label).join(', ') })
    : known ? t('dash.allGood') : '';
  const tone = bad.length ? LEVEL.perturbe : works.length ? LEVEL.travaux : LEVEL.ok;

  return (
    <View style={s.card} accessibilityLiveRegion="polite">
      <View style={s.head}>
        <View style={[s.dot, { backgroundColor: known ? tone.dot : '#C9C9D3' }]} />
        <Text style={s.headline} accessibilityRole="header">{headline}</Text>
      </View>

      {lines.length ? (
        <LineCloud
          cols={6}
          calmFill="#FFFFFF"
          showWord={false}
          lines={lines.map((l) => ({ key: l.key, code: l.code, color: l.color, textColor: l.textColor, mode: l.mode, level: l.traffic?.level ?? (known ? 'ok' : undefined) }))}
          onOpen={(c) => {
            const l = lines.find((x) => x.key === c.key);
            if (l) setSheet({ code: l.code, color: l.color, textColor: l.textColor, mode: l.mode, level: l.traffic?.level ?? 'ok', disruptions: l.traffic?.disruptions ?? [] });
          }}
        />
      ) : null}

      <LineSheet line={sheet} onClose={() => setSheet(null)} />

      <Pressable onPress={() => router.push('/trafic')} hitSlop={8} accessibilityRole="button" style={s.all}>
        <Text style={s.allText}>{t('dash.allNetwork')} ›</Text>
      </Pressable>
    </View>
  );
}

const label = (l: NearLine) => (l.mode === 'rer' ? `RER ${l.code}` : l.mode === 'metro' ? `M${l.code}` : l.mode === 'tram' ? l.code : `Bus ${l.code}`);

const s = StyleSheet.create({
  card: { backgroundColor: colors.soft, borderRadius: radius.lg, padding: 14, gap: 12 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dot: { width: 12, height: 12, borderRadius: 6 },
  headline: { flex: 1, fontFamily: fonts.display, fontSize: 20, lineHeight: 24, color: colors.ink },
  msg: { borderRadius: radius.md, padding: 12, gap: 4 },
  msgTitle: { fontFamily: fonts.bold, fontSize: 15, lineHeight: 20 },
  msgBody: { fontFamily: fonts.medium, fontSize: 14, lineHeight: 19, color: '#3A3D46' },
  all: { alignSelf: 'flex-start' },
  allText: { fontFamily: fonts.bold, fontSize: 14, color: colors.violet },
});
