import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../components/Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { trip } from '../lib/trip';
import { fetchExits } from '../lib/api';
import type { Exit } from '../lib/types';
import { meters, type LonLat } from '../lib/route';
import { BigButton } from '../components/ui';
import { IconArrowLeft, IconEscalator } from '../components/icons';
import { colors, fonts } from '../theme';
import { isExitTip } from '../lib/i18n';
import { useI18n } from '../lib/settings';

/** Arrivée : la sortie à prendre, en énorme, visible même en descendant du train. */
export default function Arrivee() {
  const { t } = useI18n();
  const j = trip.current();
  const lastLeg = j?.legs.filter((l) => l.mode !== 'walk').pop();
  const exitTip = lastLeg?.tips.find(isExitTip);
  const [exitLabel, exitPlace] = exitTip ? exitTip.split(',').map((x) => x.trim()) : [null, null];
  const exitNum = exitLabel?.replace(/^(Sortie|Exit)/i, '').trim();

  // Les vraies sorties de la gare (données IDFM). On ne prétend pas savoir laquelle est la meilleure
  // si le calcul d'itinéraire ne l'a pas dit : on les liste, simplement.
  const [rawExits, setExits] = useState<Exit[]>([]);
  useEffect(() => {
    if (lastLeg?.toId) fetchExits(lastLeg.toId).then(setExits);
  }, [lastLeg?.toId]);

  // Ta vraie destination (fin de la dernière marche) : on classe les sorties de la plus proche à la plus lointaine.
  const finalWalk = j?.legs[j.legs.length - 1]?.mode === 'walk' ? j.legs[j.legs.length - 1] : undefined;
  const dest: LonLat | undefined = finalWalk?.path?.[finalWalk.path.length - 1];
  const exits = rawExits
    .map((e) => ({ ...e, dist: dest && e.lat !== undefined && e.lon !== undefined ? Math.round(meters(dest, [e.lon, e.lat])) : undefined }))
    .sort((a, b) => (a.dist ?? 1e9) - (b.dist ?? 1e9));
  // Conseil seulement si on a vraiment de quoi comparer (au moins deux sorties situées).
  const best = !exitNum && exits.filter((e) => e.dist !== undefined).length >= 2 ? exits[0] : undefined;

  const bob = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(bob, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(bob, { toValue: 0, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [bob]);

  return (
    <View style={s.screen}>
      <SafeAreaView edges={['top']} style={s.hero}>
        <View style={s.chip}><Text style={s.chipText}>{t('arr.youAreAt', { name: lastLeg?.to ?? t('g.destination') })}</Text></View>
        <Text style={s.lead}>{exitNum ? t('arr.takeThe') : best ? t('arr.closest') : t('arr.arrived')}</Text>
        {best ? (
          <View style={{ gap: 4 }}>
            <Text style={s.place}>{best.number ? `${t('arr.exitGeneric')} ${best.number} · ` : ''}{best.name}</Text>
            {best.dist !== undefined ? <Text style={s.bestDist}>{t('arr.toDest', { n: best.dist })}</Text> : null}
          </View>
        ) : exitNum ? (
          <View style={s.exitRow}>
            <Animated.View style={[s.exitBadge, { transform: [{ translateY: bob.interpolate({ inputRange: [0, 1], outputRange: [0, -5] }) }] }]}>
              <Text style={s.exitWord}>{t('arr.exitWord')}</Text>
              <Text style={s.exitNum}>{exitNum}</Text>
            </Animated.View>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={s.place}>{exitPlace ?? ''}</Text>
            </View>
          </View>
        ) : (
          <Text style={s.place}>{t('arr.followExit')}</Text>
        )}
      </SafeAreaView>

      <SafeAreaView edges={['bottom']} style={s.body}>
        <View style={s.step}>
          <View style={[s.stepIcon, { backgroundColor: colors.ink }]}><IconArrowLeft /></View>
          <Text style={s.stepText}>{t('arr.step1', { exit: exitNum ? `${t('arr.exitGeneric')} ${exitNum}` : best ? best.name : t('arr.exitGeneric') })}</Text>
        </View>
        <View style={s.step}>
          <View style={s.stepIcon}><IconEscalator /></View>
          <Text style={s.stepText}>{t('arr.step2')}</Text>
        </View>
        {exits.length > 0 ? (
          <View style={{ flex: 1, gap: 8 }}>
            <Text style={s.h2}>{exitNum ? t('arr.allExits') : t('arr.stationExits')}</Text>
            <ScrollView contentContainerStyle={{ gap: 8 }} showsVerticalScrollIndicator={false}>
              {exits.map((e) => (
                <View key={e.id} style={[s.exit, ((e.number && e.number === exitNum) || e.id === best?.id) && s.exitOn]}>
                  <View style={s.exitChip}><Text style={s.exitChipText}>{e.number ?? '•'}</Text></View>
                  <Text style={s.exitName} numberOfLines={2}>{e.name}</Text>
                  {e.dist !== undefined ? <Text style={s.exitDist}>{e.dist} m</Text> : null}
                  {e.accessible ? <Text accessibilityLabel={t('common.accessible')}>♿</Text> : null}
                </View>
              ))}
            </ScrollView>
          </View>
        ) : <View style={{ flex: 1 }} />}
        <BigButton label={t('arr.done')} tone="ink" onPress={() => { trip.clear(); router.dismissAll(); }} />
      </SafeAreaView>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  hero: { backgroundColor: colors.lime, paddingHorizontal: 22, paddingBottom: 26, borderBottomLeftRadius: 36, borderBottomRightRadius: 36, gap: 14 },
  chip: { alignSelf: 'flex-start', backgroundColor: colors.ink, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 12, marginTop: 12 },
  chipText: { fontFamily: fonts.bold, fontSize: 14, color: '#FFFFFF' },
  lead: { fontFamily: fonts.bold, fontSize: 20, color: colors.ink },
  exitRow: { flexDirection: 'row', alignItems: 'center', gap: 18 },
  exitBadge: { width: 128, height: 128, borderRadius: 34, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  exitWord: { fontFamily: fonts.black, fontSize: 14, letterSpacing: 1.6, color: '#FFFFFF' },
  exitNum: { fontFamily: fonts.display, fontSize: 82, lineHeight: 86, color: colors.lime },
  place: { fontFamily: fonts.display, fontSize: 28, lineHeight: 30, color: colors.ink },
  body: { flex: 1, padding: 20, gap: 14 },
  step: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  stepIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.soft, alignItems: 'center', justifyContent: 'center' },
  stepText: { fontFamily: fonts.bold, fontSize: 18, color: colors.ink, flex: 1 },
  h2: { fontFamily: fonts.bold, fontSize: 16, color: colors.muted },
  exit: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.soft, borderRadius: 14, padding: 10 },
  exitOn: { backgroundColor: colors.lime },
  exitChip: { minWidth: 32, height: 32, borderRadius: 9, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  exitChipText: { fontFamily: fonts.display, fontSize: 16, color: colors.lime },
  exitName: { flex: 1, fontFamily: fonts.semi, fontSize: 15, color: colors.ink },
  bestDist: { fontFamily: fonts.bold, fontSize: 15, color: '#2B2E14' },
  exitDist: { fontFamily: fonts.semi, fontSize: 13, color: colors.muted },
  note: { fontFamily: fonts.medium, fontSize: 13, color: colors.muted, textAlign: 'center' },
});
