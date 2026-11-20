import { Redirect, router } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../components/Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { hhmm, trip } from '../lib/trip';
import { BigButton, IconButton, LineBadge, PulseDot } from '../components/ui';
import { IconBack, IconWalk } from '../components/icons';
import { colors, fonts } from '../theme';
import { isExitTip } from '../lib/i18n';
import { useI18n } from '../lib/settings';

/** Le trajet en détail : chaque étape, ses prochains départs et les conseils pratiques. Puis Go. */
export default function Trajet() {
  const { t, tn } = useI18n();
  const j = trip.current();
  if (!j) return <Redirect href="/" />;
  const exit = j.legs.flatMap((l) => l.tips).find(isExitTip);

  return (
    <SafeAreaView style={s.screen} edges={['top']}>
      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <View style={s.top}>
          <IconButton label={t('common.back')} onPress={() => router.back()}><IconBack /></IconButton>
          {j.reliability === 'direct' ? (
            <View style={s.reliable}><PulseDot /><Text style={s.reliableText}>{t('trip.reliable')}</Text></View>
          ) : null}
        </View>

        <View style={s.summary}>
          <Text style={s.dur}>{j.durationMin}<Text style={s.durUnit}> {t('common.min')}</Text></Text>
          <Text style={s.times}>{hhmm(j.departureAt)} → {hhmm(j.arrivalAt)}</Text>
        </View>

        {j.legs.map((leg, i) =>
          leg.mode === 'walk' ? (
            <View key={i} style={s.walk}>
              <View style={s.rail}><IconWalk /></View>
              <Text style={s.walkText}>{t('trip.walk', { n: leg.durationMin })}</Text>
              {leg.tips[0] ? <View style={s.tipChip}><Text style={s.tipChipText}>{leg.tips[0]}</Text></View> : null}
            </View>
          ) : (
            <View key={i} style={s.leg}>
              <View style={s.rail}>
                <LineBadge code={leg.lineCode} color={leg.lineColor} textColor={leg.lineTextColor} size={36} />
                <View style={[s.railLine, { backgroundColor: leg.lineColor }]} />
              </View>
              <View style={s.legCard}>
                <View style={s.legHead}>
                  <Text style={s.legDir} numberOfLines={1}>{t('trip.towards', { dir: leg.direction })}</Text>
                  <Text style={s.legMeta}>{tn('trip.stops', 'trip.stopsPlural', Math.max(leg.stops.length - 1, 1), { m: leg.durationMin })}</Text>
                </View>
                <Text style={s.legFromTo}>{leg.from} → {leg.to}</Text>
                <View style={s.chips}>
                  <View style={s.chipLive}><PulseDot size={6} /><Text style={s.chipLiveText}>{hhmm(leg.departureAt)}</Text></View>
                </View>
                {leg.tips.map((tip) => (
                  <Text key={tip} style={isExitTip(tip) ? s.exitTip : s.tip}>{tip}</Text>
                ))}
              </View>
            </View>
          ),
        )}

        {exit ? (
          <View style={s.exit}>
            <Text style={s.exitLabel}>{t('trip.atArrival')}</Text>
            <View style={s.exitBadge}><Text style={s.exitBadgeText}>{exit.split(',')[0].toUpperCase()}</Text></View>
          </View>
        ) : null}
      </ScrollView>
      <SafeAreaView edges={['bottom']} style={s.footer}>
        <BigButton label={t('trip.go')} onPress={() => router.push('/en-route')} />
      </SafeAreaView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 20, paddingTop: 8, gap: 14, paddingBottom: 128 },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  reliable: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.lime, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 12 },
  reliableText: { fontFamily: fonts.black, fontSize: 13, color: colors.ink },
  summary: { gap: 2, marginBottom: 4 },
  dur: { fontFamily: fonts.display, fontSize: 72, color: colors.ink, letterSpacing: -2, lineHeight: 76 },
  durUnit: { fontSize: 26 },
  times: { fontFamily: fonts.semi, fontSize: 16, color: '#3A3D46' },
  walk: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  walkText: { fontFamily: fonts.semi, fontSize: 15, color: colors.ink, flex: 1 },
  tipChip: { backgroundColor: colors.soft, borderRadius: 10, paddingVertical: 5, paddingHorizontal: 9 },
  tipChipText: { fontFamily: fonts.bold, fontSize: 13, color: colors.ink },
  leg: { flexDirection: 'row', gap: 12 },
  rail: { width: 36, alignItems: 'center' },
  railLine: { width: 4, flex: 1, borderRadius: 2, marginTop: 4 },
  legCard: { flex: 1, backgroundColor: colors.soft, borderRadius: 18, padding: 12, gap: 8 },
  legHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 },
  legDir: { fontFamily: fonts.bold, fontSize: 16, color: colors.ink, flexShrink: 1 },
  legMeta: { fontFamily: fonts.medium, fontSize: 13, color: colors.muted },
  legFromTo: { fontFamily: fonts.medium, fontSize: 13, color: '#3A3D46' },
  chips: { flexDirection: 'row', gap: 6 },
  chipLive: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors.lime, borderRadius: 999, paddingVertical: 4, paddingHorizontal: 10 },
  chipLiveText: { fontFamily: fonts.black, fontSize: 14, color: colors.ink },
  tip: { fontFamily: fonts.semi, fontSize: 13, color: '#3A3D46' },
  exitTip: { fontFamily: fonts.bold, fontSize: 13, color: colors.violet },
  exit: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  exitLabel: { fontFamily: fonts.semi, fontSize: 15, color: '#3A3D46' },
  exitBadge: { backgroundColor: colors.ink, borderRadius: 8, paddingVertical: 4, paddingHorizontal: 10 },
  exitBadgeText: { fontFamily: fonts.black, fontSize: 14, color: colors.lime },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 20, paddingTop: 10, backgroundColor: 'rgba(255,255,255,0.98)' },
});
