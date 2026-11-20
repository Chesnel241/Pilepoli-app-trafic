import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from './Text';
import { LineBadge } from './ui';
import { cleanTitle, lineName, structure } from '../lib/disruption';
import { getLang, localeTag, t } from '../lib/i18n';
import { LEVEL, type ModeKey } from '../lib/lines';
import type { Disruption, TrafficLevel } from '../lib/types';
import { colors, fonts, radius } from '../theme';

export interface SheetLine { code: string; color: string; textColor: string; mode: ModeKey; level: TrafficLevel; disruptions: Disruption[] }

const when = (iso: string) => {
  const d = new Date(iso);
  const day = d.toLocaleDateString(localeTag(), { weekday: 'short', day: 'numeric', month: 'short' });
  const time = `${String(d.getHours()).padStart(2, '0')}${getLang() === 'en' ? ':' : 'h'}${String(d.getMinutes()).padStart(2, '0')}`;
  return `${day} ${time}`;
};

/**
 * Le détail d'une ligne, en feuille qui monte du bas : lisible à l'aise même quand le message est long.
 * En ce moment d'abord, à venir ensuite ; pour chaque perturbation, l'essentiel en une phrase,
 * puis Quand / Pourquoi / Où / Conseil, puis le reste replié.
 */
export function LineSheet({ line, onClose }: { line: SheetLine | null; onClose: () => void }) {
  if (!line) return null;
  const now = line.disruptions.filter((d) => !d.upcoming);
  const later = line.disruptions.filter((d) => d.upcoming);
  const lv = LEVEL[line.level];
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose} accessibilityLabel={t('common.close')} />
      <SafeAreaView edges={['bottom']} style={s.sheet}>
        <View style={s.grabber} />
        <View style={s.head}>
          <LineBadge code={line.code} color={line.color} textColor={line.textColor} size={52} round={line.mode === 'metro'} />
          <View style={{ flex: 1, gap: 6 }}>
            <Text style={s.name} accessibilityRole="header">{lineName(line.code, line.mode)}</Text>
            <View style={[s.pill, { backgroundColor: lv.bg }]}><Text style={[s.pillText, { color: lv.fg }]}>{t(`lvl.${line.level}`)}</Text></View>
          </View>
        </View>

        <ScrollView contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>
          {line.disruptions.length === 0 ? <Text style={s.empty}>{t('dis.nothing')}</Text> : null}
          {now.length ? <Text style={s.section}>{t('dis.now')}</Text> : null}
          {now.map((d) => <Item key={d.id} d={d} />)}
          {later.length ? <Text style={s.section}>{t('dis.later')}</Text> : null}
          {later.map((d) => <Item key={d.id} d={d} />)}
          {getLang() === 'en' && line.disruptions.length ? <Text style={s.note}>{t('traffic.frenchOnly')}</Text> : null}
        </ScrollView>

        <Pressable onPress={onClose} style={s.close} accessibilityRole="button">
          <Text style={s.closeText}>{t('common.close')}</Text>
        </Pressable>
      </SafeAreaView>
    </Modal>
  );
}

function Item({ d }: { d: Disruption }) {
  const [open, setOpen] = useState(false);
  const st = structure(d.message);
  const lv = LEVEL[d.level];
  const hasPeriod = !!(d.start || d.end);
  const showPeriodFact = hasPeriod && !st.facts.some((f) => f.label === t('dis.when'));
  return (
    <View style={[s.item, { borderLeftColor: lv.dot }]}>
      <Text style={s.title}>{cleanTitle(d.title)}</Text>
      {st.lead ? <Text style={s.lead}>{st.lead}</Text> : null}

      {showPeriodFact || st.facts.length ? (
        <View style={s.facts}>
          {showPeriodFact ? (
            <Fact label={t('dis.when')} text={[d.start && d.upcoming ? t('traffic.from', { date: when(d.start) }) : '', d.end ? t('traffic.until', { date: when(d.end) }) : ''].filter(Boolean).join(' · ')} />
          ) : null}
          {st.facts.map((f, i) => <Fact key={i} label={f.label} text={f.text} />)}
        </View>
      ) : null}

      {st.paragraphs.length ? (
        <>
          {(open ? st.paragraphs : st.paragraphs.slice(0, 1)).map((p, i) => <Text key={i} style={s.para}>{p}</Text>)}
          {st.paragraphs.length > 1 ? (
            <Pressable onPress={() => setOpen(!open)} hitSlop={8} accessibilityRole="button">
              <Text style={s.more}>{open ? t('dis.readLess') : t('dis.readMore')}</Text>
            </Pressable>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

function Fact({ label, text }: { label: string; text: string }) {
  if (!text) return null;
  return (
    <View style={s.fact}>
      <Text style={s.factLabel}>{label}</Text>
      <Text style={s.factText}>{text}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(14,15,18,0.45)' },
  sheet: { maxHeight: '86%', backgroundColor: colors.bg, borderTopLeftRadius: 30, borderTopRightRadius: 30, paddingTop: 8 },
  grabber: { alignSelf: 'center', width: 44, height: 5, borderRadius: 3, backgroundColor: '#D9D9E0', marginBottom: 10 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingBottom: 12 },
  name: { fontFamily: fonts.display, fontSize: 26, color: colors.ink },
  pill: { alignSelf: 'flex-start', borderRadius: radius.pill, paddingVertical: 4, paddingHorizontal: 10 },
  pillText: { fontFamily: fonts.black, fontSize: 13 },
  body: { paddingHorizontal: 20, paddingBottom: 12, gap: 12 },
  section: { fontFamily: fonts.bold, fontSize: 13, letterSpacing: 1, color: colors.muted, textTransform: 'uppercase', marginTop: 6 },
  empty: { fontFamily: fonts.semi, fontSize: 16, color: colors.muted },
  item: { backgroundColor: colors.soft, borderRadius: 18, padding: 16, gap: 10, borderLeftWidth: 5 },
  title: { fontFamily: fonts.bold, fontSize: 18, lineHeight: 24, color: colors.ink },
  lead: { fontFamily: fonts.semi, fontSize: 16, lineHeight: 24, color: colors.ink },
  facts: { gap: 8, backgroundColor: '#FFFFFF', borderRadius: 14, padding: 12 },
  fact: { gap: 2 },
  factLabel: { fontFamily: fonts.bold, fontSize: 12, letterSpacing: 0.8, color: colors.muted, textTransform: 'uppercase' },
  factText: { fontFamily: fonts.semi, fontSize: 16, lineHeight: 22, color: colors.ink },
  para: { fontFamily: fonts.medium, fontSize: 16, lineHeight: 24, color: '#3A3D46' },
  more: { fontFamily: fonts.bold, fontSize: 15, color: colors.violet },
  note: { fontFamily: fonts.medium, fontSize: 13, color: colors.muted },
  close: { marginHorizontal: 20, marginVertical: 10, minHeight: 54, borderRadius: radius.pill, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  closeText: { fontFamily: fonts.black, fontSize: 17, color: '#FFFFFF' },
});
