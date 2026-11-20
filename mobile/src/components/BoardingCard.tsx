import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { CloseButton, FullModal } from './FullModal';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Text } from './Text';
import { LineBadge } from './ui';
import { ModeAnimation } from './ModeAnimation';
import Svg, { Circle, Path } from 'react-native-svg';
import type { Boarding } from '../lib/boarding';
import { hhmm } from '../lib/trip';
import { getLang, t } from '../lib/i18n';
import type { JourneyLeg } from '../lib/types';
import { colors, fonts, radius } from '../theme';

const isMission = (v?: string) => !!v && /^[A-Z]{4}$/.test(v);
const short = (n: string) => n.replace(/\s*\(.*\)$/, '').trim();

/**
 * « Ton train », sur le quai : ce qu'il faut comparer au panneau de gare (code mission en géant, ou terminus et via),
 * le verdict « s'arrête à ta gare », le piège à laisser passer, et MONTE / ATTENDS quand un train est à quai.
 */
export function BoardingCard({ leg, b }: { leg: JourneyLeg; b: Boarding | null }) {
  const [show, setShow] = useState(false);
  const target = short(leg.to);
  const mine = b?.mine;
  const mission = isMission(mine?.mission) ? mine!.mission! : isMission(leg.mission) ? leg.mission! : undefined;
  const bus = leg.mode === 'bus' || leg.mode === 'tram';
  const dest = mine?.destination ?? leg.direction;
  const via = mine?.via;
  const platform = mine?.platform;
  const minutes = mine?.minutes ?? Math.max(0, Math.round((Date.parse(leg.departureAt) - Date.now()) / 60_000));
  const verdict = !mine ? (b ? 'unknown' : 'loading') : mine.serves === 'yes' ? 'yes' : mine.serves === 'probable' || mine.serves === undefined ? 'probable' : 'unknown';

  // Retour physique : une longue vibration pour monter, deux courtes pour attendre.
  const last = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (b?.action && b.action !== last.current) {
      if (b.action === 'board') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => null);
      else Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => null);
    }
    last.current = b?.action;
  }, [b?.action]);

  return (
    <View style={s.card} accessibilityLiveRegion="polite">
      {b?.action ? (
        <View style={[s.action, b.action === 'board' ? s.board : s.wait]}>
          <Text style={[s.actionWord, b.action === 'board' ? { color: colors.lime } : { color: '#FFFFFF' }]}>{b.action === 'board' ? t('bt.board') : t('bt.wait')}</Text>
          <Text style={s.actionSub}>{b.action === 'board' ? t('bt.boardSub') : t('bt.waitSub', { n: Math.max(1, minutes) })}</Text>
        </View>
      ) : null}

      <View style={s.head}>
        <Text style={s.kicker}>{bus ? t('bt.titleBus') : t('bt.title')}</Text>
        <ModeAnimation mode={leg.mode} size={34} playing={false} />
      </View>

      {/* Ce qu'on compare au panneau : le code mission en géant, sinon le terminus et le via. */}
      <View style={s.idRow}>
        <LineBadge code={leg.lineCode} color={leg.lineColor} textColor={leg.lineTextColor} size={52} round={leg.mode === 'metro'} />
        {mission ? (
          <View style={s.missionPill} accessibilityLabel={`${t('bt.check', { code: mission })}`}>
            <Text style={s.missionText}>{mission}</Text>
          </View>
        ) : (
          <View style={{ flex: 1 }}>
            <Text style={s.dest} numberOfLines={2}>→ {dest}</Text>
            {via ? <Text style={s.via}>{t('bt.via', { via })}</Text> : null}
          </View>
        )}
      </View>
      {mission ? <Text style={s.destSmall} numberOfLines={1}>→ {dest}{via ? ` · ${t('bt.via', { via })}` : ''}</Text> : null}

      <View style={s.facts}>
        <View style={s.fact}><Text style={s.factBig}>{minutes <= 0 ? t('stop.atPlatform') : `${minutes}′`}</Text><Text style={s.factLabel}>{mine ? hhmm(mine.expectedAt ?? mine.aimedAt ?? leg.departureAt) : hhmm(leg.departureAt)}</Text></View>
        {platform ? <View style={s.fact}><Text style={s.factBig}>{platform}</Text><Text style={s.factLabel}>{t('bt.platform', { p: '' }).trim()}</Text></View> : null}
      </View>

      {verdict === 'yes' ? <Text style={[s.verdict, s.yes]}>✓ {t('bt.goesTo', { name: target })}</Text>
        : verdict === 'probable' ? <Text style={[s.verdict, s.probable]}>✓ {t('bt.probable', { name: target })}{mission ? `. ${t('bt.check', { code: mission })}` : ''}</Text>
        : verdict === 'unknown' ? <Text style={[s.verdict, s.unknown]}>? {t('bt.unknown', { name: target })}</Text>
        : null}

      {b?.trap ? (
        <View style={s.trap}>
          <Text style={s.trapText}>✕ {t('bt.notThis', { time: hhmm(b.trap.expectedAt ?? b.trap.aimedAt ?? ''), name: target })}</Text>
          {b.trap.mission ? <Text style={s.trapMission}>{b.trap.mission}</Text> : null}
        </View>
      ) : null}

      {/* Fourche : ton terminus et celui du train piège, comme un Y. Ta branche épaisse, l'autre fine et barrée. */}
      {b?.trap && mine && norm(b.trap.destination) !== norm(mine.destination) ? (
        <ForkY mine={short(mine.destination)} other={short(b.trap.destination)} color={leg.lineColor} />
      ) : null}

      {b?.next ? <Text style={s.next}>{t('bt.next', { time: hhmm(b.next.at), name: target })}</Text> : null}

      <Pressable onPress={() => setShow(true)} style={s.showBtn} accessibilityRole="button">
        <Text style={s.showText}>{t('bt.show')}</Text>
      </Pressable>

      <ShowSomeone visible={show} onClose={() => setShow(false)} leg={leg} mission={mission} target={target} bus={bus} />
    </View>
  );
}

const norm = (x: string) => x.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\(.*?\)/g, '').trim();

function ForkY({ mine, other, color }: { mine: string; other: string; color: string }) {
  return (
    <View style={s.fork} accessibilityLabel={`${mine} ✓, ${other} ✕`}>
      <Svg width={120} height={84} viewBox="0 0 120 84">
        <Path d="M60 84 L60 48" stroke={color} strokeWidth={8} strokeLinecap="round" />
        <Path d="M60 48 Q60 30 26 12" stroke={colors.lime} strokeWidth={8} strokeLinecap="round" fill="none" />
        <Path d="M60 48 Q60 30 94 12" stroke="#5C5F6A" strokeWidth={3} strokeDasharray="4 5" strokeLinecap="round" fill="none" />
        <Circle cx={26} cy={12} r={7} fill={colors.lime} />
        <Circle cx={94} cy={12} r={5} fill="#5C5F6A" />
      </Svg>
      <View style={s.forkLabels}>
        <Text style={s.forkMine} numberOfLines={2}>✓ {mine}</Text>
        <Text style={s.forkOther} numberOfLines={2}>✕ {other}</Text>
      </View>
    </View>
  );
}

/** En très gros, à montrer à quelqu'un sur le quai (toujours en français, la langue des gens autour). */
function ShowSomeone({ visible, onClose, leg, mission, target, bus }: { visible: boolean; onClose: () => void; leg: JourneyLeg; mission?: string; target: string; bus: boolean }) {
  const frQuestion = bus ? `Ce bus s’arrête-t-il à ${target} ?` : `Ce train s’arrête-t-il à ${target} ?`;
  return (
    <FullModal visible={visible} animationType="fade" onRequestClose={onClose}>
      <SafeAreaView style={s.showScreen}>
        <ScrollView contentContainerStyle={s.showBody}>
          <View style={s.showIds}>
            <LineBadge code={leg.lineCode} color={leg.lineColor} textColor={leg.lineTextColor} size={72} round={leg.mode === 'metro'} />
            {mission ? <View style={[s.missionPill, { paddingHorizontal: 22 }]}><Text style={[s.missionText, { fontSize: 44 }]}>{mission}</Text></View> : null}
          </View>
          <Text style={s.showQ}>{frQuestion}</Text>
          {getLang() !== 'fr' ? <Text style={s.showQSub}>{bus ? t('bt.showBus', { name: target }) : t('bt.showQuestion', { name: target })}</Text> : null}
        </ScrollView>
        <Pressable onPress={onClose} style={s.showClose} accessibilityRole="button"><Text style={s.showCloseText}>{t('bt.showClose')}</Text></Pressable>
      </SafeAreaView>
    </FullModal>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: colors.ink, borderRadius: 26, padding: 16, gap: 12 },
  action: { borderRadius: 18, paddingVertical: 12, paddingHorizontal: 16, gap: 2 },
  board: { backgroundColor: colors.violet },
  wait: { backgroundColor: '#2A2C33', borderWidth: 2, borderColor: '#FFFFFF' },
  actionWord: { fontFamily: fonts.display, fontSize: 40, lineHeight: 42, letterSpacing: -1 },
  actionSub: { fontFamily: fonts.bold, fontSize: 15, color: '#FFFFFF' },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  kicker: { fontFamily: fonts.black, fontSize: 13, letterSpacing: 1.5, color: '#B9BAC2', textTransform: 'uppercase' },
  idRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  missionPill: { backgroundColor: colors.lime, borderRadius: 16, paddingVertical: 6, paddingHorizontal: 16 },
  missionText: { fontFamily: fonts.display, fontSize: 40, lineHeight: 44, letterSpacing: 2, color: colors.ink },
  dest: { fontFamily: fonts.display, fontSize: 24, lineHeight: 27, color: '#FFFFFF' },
  destSmall: { fontFamily: fonts.bold, fontSize: 15, color: '#D7D7DE' },
  via: { fontFamily: fonts.black, fontSize: 16, color: colors.lime },
  facts: { flexDirection: 'row', gap: 10 },
  fact: { backgroundColor: '#2A2C33', borderRadius: 14, paddingVertical: 8, paddingHorizontal: 14, alignItems: 'flex-start' },
  factBig: { fontFamily: fonts.display, fontSize: 26, color: '#FFFFFF' },
  factLabel: { fontFamily: fonts.bold, fontSize: 12, color: '#B9BAC2' },
  verdict: { fontFamily: fonts.bold, fontSize: 16, lineHeight: 22, borderRadius: 12, paddingVertical: 8, paddingHorizontal: 12, overflow: 'hidden' },
  yes: { backgroundColor: colors.lime, color: colors.ink },
  probable: { backgroundColor: '#E6F5C8', color: colors.ink },
  unknown: { backgroundColor: colors.amberBg, color: colors.amberInk },
  trap: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1.5, borderColor: '#5C5F6A', borderStyle: 'dashed', borderRadius: 12, padding: 10 },
  trapText: { flex: 1, fontFamily: fonts.semi, fontSize: 14, lineHeight: 19, color: '#D7D7DE' },
  trapMission: { fontFamily: fonts.black, fontSize: 13, color: '#B9BAC2', textDecorationLine: 'line-through' },
  fork: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#1B1D22', borderRadius: 16, padding: 10 },
  forkLabels: { flex: 1, gap: 10 },
  forkMine: { fontFamily: fonts.display, fontSize: 18, color: colors.lime },
  forkOther: { fontFamily: fonts.semi, fontSize: 14, color: '#8E909A', textDecorationLine: 'line-through' },
  next: { fontFamily: fonts.semi, fontSize: 14, color: '#B9BAC2' },
  showBtn: { alignSelf: 'flex-start', borderRadius: radius.pill, borderWidth: 1.5, borderColor: '#5C5F6A', paddingVertical: 8, paddingHorizontal: 14 },
  showText: { fontFamily: fonts.bold, fontSize: 14, color: '#FFFFFF' },
  showScreen: { flex: 1, backgroundColor: colors.bg },
  showBody: { flexGrow: 1, justifyContent: 'center', padding: 28, gap: 24 },
  showIds: { flexDirection: 'row', alignItems: 'center', gap: 18 },
  showQ: { fontFamily: fonts.display, fontSize: 44, lineHeight: 48, color: colors.ink, letterSpacing: -1 },
  showQSub: { fontFamily: fonts.semi, fontSize: 20, lineHeight: 26, color: colors.muted },
  showClose: { margin: 20, minHeight: 60, borderRadius: radius.pill, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  showCloseText: { fontFamily: fonts.black, fontSize: 18, color: '#FFFFFF' },
});
