import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from './Text';
import { LineBadge, StatusChip } from './ui';
import { depLabel, predictionLabel } from '../lib/labels';
import { lineName } from '../lib/disruption';
import { t } from '../lib/i18n';
import { modeKey } from '../lib/lines';
import type { RatedDeparture, Serves } from '../lib/types';
import { colors, fonts, radius } from '../theme';

/**
 * Tableau des passages d'une gare, pensé contre la confusion :
 * - une ligne = un bloc, chaque sens (terminus + via) = une rangée bien séparée ;
 * - le code mission et le quai sont écrits sous chaque horaire, comme sur le panneau ;
 * - si on a choisi une destination, chaque passage dit s'il s'y arrête, et ceux qui n'y vont pas passent dessous, en retrait.
 */
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\(.*?\)/g, '').trim();
const goes = (sv?: Serves) => sv === 'yes' || sv === 'probable';

interface Row { key: string; d: RatedDeparture; list: RatedDeparture[]; serves?: Serves }
interface Block { key: string; line: RatedDeparture; rows: Row[] }

function group(deps: RatedDeparture[], withServes: boolean): Block[] {
  const blocks = new Map<string, Block>();
  for (const d of deps) {
    const lk = `${modeKey(d.mode ?? '', d.lineCode)}|${d.lineCode}`;
    const bucket = withServes ? (goes(d.serves) ? 'go' : d.serves ?? 'unknown') : '';
    const rk = `${norm(d.destination)}|${norm(d.via ?? '')}|${bucket}`;
    const b = blocks.get(lk) ?? { key: lk, line: d, rows: [] };
    let row = b.rows.find((r) => r.key === rk);
    if (!row) { row = { key: rk, d, list: [], serves: withServes ? (goes(d.serves) ? (d.serves === 'yes' ? 'yes' : 'probable') : d.serves) : undefined }; b.rows.push(row); }
    if (row.list.length < 3) row.list.push(d);
    if (d.serves === 'yes') row.serves = 'yes';
    blocks.set(lk, b);
  }
  return [...blocks.values()];
}

export function DepartureBoard({ departures, destName, max = 12 }: { departures: RatedDeparture[]; destName?: string; max?: number }) {
  const [showOthers, setShowOthers] = useState(false);
  const withServes = !!destName;
  const { going, others } = useMemo(() => {
    const blocks = group(departures, withServes).slice(0, max);
    if (!withServes) return { going: blocks, others: [] as Block[] };
    const split = (keep: (r: Row) => boolean) => blocks
      .map((b) => ({ ...b, rows: b.rows.filter(keep) }))
      .filter((b) => b.rows.length);
    return { going: split((r) => r.serves !== 'no'), others: split((r) => r.serves === 'no') };
  }, [departures, withServes, max]);

  return (
    <View style={{ gap: 12 }}>
      {going.map((b) => <BlockView key={b.key} b={b} destName={destName} />)}
      {others.length ? (
        <View style={{ gap: 10 }}>
          <Pressable onPress={() => setShowOthers(!showOthers)} accessibilityRole="button" style={s.othersHead}>
            <Text style={s.othersText}>{t('stop.otherDirections', { name: destName ?? '' })} {showOthers ? '▲' : '▼'}</Text>
          </Pressable>
          {showOthers ? others.map((b) => <BlockView key={b.key} b={b} destName={destName} dim />) : null}
        </View>
      ) : null}
    </View>
  );
}

function BlockView({ b, destName, dim = false }: { b: Block; destName?: string; dim?: boolean }) {
  const mk = modeKey(b.line.mode ?? '', b.line.lineCode);
  return (
    <View style={[s.block, dim && { opacity: 0.55 }]}>
      <View style={s.blockHead}>
        <LineBadge code={b.line.lineCode} color={b.line.lineColor ?? colors.violet} textColor={b.line.lineTextColor ?? '#FFFFFF'} size={34} round={mk === 'metro'} />
        <Text style={s.lineName}>{lineName(b.line.lineCode, mk)}</Text>
      </View>
      {b.rows.map((r) => <RowView key={r.key} r={r} destName={destName} />)}
    </View>
  );
}

function RowView({ r, destName }: { r: Row; destName?: string }) {
  const first = r.list[0];
  const pred = predictionLabel(first);
  return (
    <View style={s.row}>
      <View style={{ flex: 1, gap: 5 }}>
        <Text style={s.dest} numberOfLines={2}>→ {first.destination}</Text>
        {first.via ? <Text style={s.via}>{t('bt.via', { via: first.via })}</Text> : null}
        {destName && r.serves ? <ServesBadge serves={r.serves} name={destName} /> : null}
        <StatusChip reliability={first.reliability} label={depLabel(first)} />
        {pred ? <Text style={s.pred}>{pred}</Text> : null}
      </View>
      <View style={s.times}>
        {r.list.map((x, i) => (
          <View key={x.journeyRef} style={s.time}>
            <Text style={[i === 0 ? s.timeMain : s.timeNext, x.reliability === 'supprime' && s.cancelled]}>
              {x.reliability === 'supprime' ? t('stop.cancelled') : x.minutes === null || x.reliability === 'pas_vu' ? '?' : x.minutes <= 0 ? t('stop.atPlatform') : `${x.minutes}′`}
            </Text>
            {/* Ce qu'affiche le panneau de gare : code mission et quai. */}
            {x.mission || x.platform ? (
              <View style={s.tags}>
                {x.mission ? <View style={s.mission}><Text style={s.missionText}>{x.mission}</Text></View> : null}
                {x.platform ? <Text style={s.platform}>{t('bt.platform', { p: x.platform })}</Text> : null}
              </View>
            ) : null}
          </View>
        ))}
      </View>
    </View>
  );
}

export function ServesBadge({ serves, name }: { serves: Serves; name: string }) {
  const map = {
    yes: { bg: '#E7F7D9', fg: '#1F5E14', icon: '✓', label: t('srv.yes', { name }) },
    probable: { bg: '#EEF6E2', fg: '#3D6B1F', icon: '✓', label: t('srv.probable', { name }) },
    no: { bg: colors.soft, fg: colors.muted, icon: '✕', label: t('srv.no', { name }) },
    unknown: { bg: colors.amberBg, fg: colors.amberInk, icon: '?', label: t('srv.unknown') },
  }[serves];
  return (
    <View style={[s.serves, { backgroundColor: map.bg }]} accessibilityLabel={map.label}>
      <Text style={[s.servesIcon, { color: map.fg }]}>{map.icon}</Text>
      <Text style={[s.servesText, { color: map.fg }]} numberOfLines={1}>{map.label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  block: { backgroundColor: colors.soft, borderRadius: 20, padding: 12, gap: 4 },
  blockHead: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingBottom: 4 },
  lineName: { fontFamily: fonts.bold, fontSize: 15, color: colors.muted },
  row: { flexDirection: 'row', gap: 10, backgroundColor: '#FFFFFF', borderRadius: 14, padding: 12 },
  dest: { fontFamily: fonts.display, fontSize: 18, lineHeight: 22, color: colors.ink },
  via: { fontFamily: fonts.bold, fontSize: 14, color: colors.violet, marginTop: -3 },
  pred: { fontFamily: fonts.medium, fontSize: 12, color: colors.muted },
  times: { alignItems: 'flex-end', gap: 6, minWidth: 74 },
  time: { alignItems: 'flex-end', gap: 2 },
  timeMain: { fontFamily: fonts.display, fontSize: 24, color: colors.ink },
  timeNext: { fontFamily: fonts.bold, fontSize: 15, color: '#3A3D46' },
  cancelled: { color: colors.redInk, textDecorationLine: 'line-through', fontSize: 14 },
  tags: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  mission: { backgroundColor: colors.ink, borderRadius: 6, paddingHorizontal: 5, paddingVertical: 1 },
  missionText: { fontFamily: fonts.black, fontSize: 11, color: colors.lime, letterSpacing: 0.5 },
  platform: { fontFamily: fonts.bold, fontSize: 11, color: colors.ink },
  serves: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 6, borderRadius: radius.pill, paddingVertical: 4, paddingHorizontal: 10, maxWidth: '100%' },
  servesIcon: { fontFamily: fonts.black, fontSize: 13 },
  servesText: { fontFamily: fonts.bold, fontSize: 13, flexShrink: 1 },
  othersHead: { paddingVertical: 6 },
  othersText: { fontFamily: fonts.bold, fontSize: 14, color: colors.muted },
});
