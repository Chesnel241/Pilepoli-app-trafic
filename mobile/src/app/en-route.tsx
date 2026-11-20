import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, router } from 'expo-router';
import { guideStops, hhmm, trip } from '../lib/trip';
import { computeGuide, nextDemoInstant } from '../lib/guide';
import { IconButton, PulseDot } from '../components/ui';
import { IconClose, IconWalk } from '../components/icons';
import { TrainTrack } from '../components/TrainTrack';
import { colors, fonts } from '../theme';

/** Après Go : la consigne du moment en haut, tous les arrêts en dessous. Rien à toucher. */
export default function EnRoute() {
  const j = trip.current();
  const stops = useMemo(() => (j ? guideStops(j) : []), [j]);
  const [offset, setOffset] = useState(0); // décalage d'horloge pour la démo
  const [tick, setTick] = useState(Date.now());
  const leaving = useRef(false);
  const [boarding, setBoarding] = useState(true);
  const trainX = useRef(new Animated.Value(-160)).current;
  const walkX = useRef(new Animated.Value(-8)).current;
  const walkBounce = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const id = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    trainX.setValue(-160);
    const train = Animated.timing(trainX, {
      toValue: 160,
      duration: 2200,
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: true,
    });
    train.start();
    const id = setTimeout(() => setBoarding(false), 3000);
    return () => {
      train.stop();
      clearTimeout(id);
    };
  }, [trainX]);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(walkX, { toValue: 10, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(walkX, { toValue: -8, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    const bounce = Animated.loop(
      Animated.sequence([
        Animated.timing(walkBounce, { toValue: -5, duration: 350, useNativeDriver: true }),
        Animated.timing(walkBounce, { toValue: 0, duration: 350, useNativeDriver: true }),
      ]),
    );
    loop.start();
    bounce.start();
    return () => { loop.stop(); bounce.stop(); };
  }, [walkBounce, walkX]);

  const now = tick + offset;
  const state = computeGuide(stops, now);
  const previousPhase = useRef(state.phase);

  useEffect(() => {
    if (previousPhase.current !== state.phase) {
      Haptics.notificationAsync(
        state.phase === 'arrived'
          ? Haptics.NotificationFeedbackType.Success
          : Haptics.NotificationFeedbackType.Warning,
      ).catch(() => null);
      previousPhase.current = state.phase;
    }
  }, [state.phase]);

  // Arrivé : l'écran Sortie s'ouvre tout seul.
  useEffect(() => {
    if (state.phase === 'arrived' && !leaving.current) {
      leaving.current = true;
      const id = setTimeout(() => router.replace('/arrivee'), 1500);
      return () => clearTimeout(id);
    }
  }, [state.phase]);

  if (!j) return <Redirect href="/" />;

  const demo = () => {
    const nxt = nextDemoInstant(stops, now);
    if (nxt) setOffset(nxt - Date.now());
  };

  const c = state.card;
  return (
    <SafeAreaView style={s.screen}>
      <Modal visible={boarding} transparent={false} animationType="fade" onRequestClose={() => setBoarding(false)}>
        <SafeAreaView style={s.boarding}>
          <View style={s.boardingTop}>
            <Text style={s.boardingKicker}>Début du trajet</Text>
            <Text style={s.boardingCode}>{stops[0]?.lineCode}</Text>
          </View>
          <View style={s.trackWindow}>
            <Animated.View style={[s.miniTrain, { transform: [{ translateX: trainX }] }]}>
              {[0, 1, 2].map((car) => (
                <View key={car} style={[s.trainCar, car === 2 && s.trainHead]}>
                  <View style={s.trainWindow} />
                </View>
              ))}
            </Animated.View>
            <View style={s.trackLine} />
          </View>
          <View style={s.boardingCopy}>
            <Text style={s.boardingTitle}>Tu es dans le train</Text>
            <Text style={s.boardingSub}>Direction {stops[0]?.direction}</Text>
          </View>
        </SafeAreaView>
      </Modal>

      <Modal visible={!boarding && state.phase === 'walking'} transparent={false} animationType="fade">
        <SafeAreaView style={s.walkScreen}>
          <View style={s.walkHeader}>
            <Text style={s.walkFrom}>Depuis {stops[state.at]?.name}</Text>
            <View style={s.walkTime}>
              <Text style={s.walkTimeText}>dans {Math.max(1, Math.round((stops[state.at + 1].at - now) / 60_000))} min</Text>
            </View>
          </View>
          <View style={s.walkHero}>
            <Animated.View style={{ transform: [{ translateX: walkX }, { translateY: walkBounce }] }}>
              <View style={s.walkPerson}>
                <IconWalk size={82} color={colors.ink} />
              </View>
            </Animated.View>
            <Animated.View style={{ transform: [{ translateX: walkX }] }}>
              <Text style={s.walkArrow}>→</Text>
            </Animated.View>
          </View>
          <View style={s.walkBottom}>
            <Text style={s.walkEyebrow}>À pied · 3 min</Text>
            <Text style={s.walkTitle}>Marche vers le {stops[state.at + 1]?.lineCode}</Text>
            <Text style={s.walkSub}>{stops[state.at + 1]?.tags.find((tag) => tag.startsWith('Quai')) ?? 'Suivre les panneaux'}</Text>
            <View style={s.walkProgress}><View style={[s.walkProgressFill, { width: `${Math.round(state.progress * 100)}%` }]} /></View>
          </View>
        </SafeAreaView>
      </Modal>

      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <View style={s.top}>
          <IconButton label="Quitter le guidage" onPress={() => router.back()}><IconClose /></IconButton>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={s.arrLabel}>Arrivée</Text>
            <Text style={s.arr}>{hhmm(j.arrivalAt)}</Text>
          </View>
        </View>

        <View style={s.card} accessibilityLiveRegion="polite">
          <View style={s.cardHead}>
            <View style={s.row}>
              <View style={[s.badge, { backgroundColor: c.badgeColor }]}><Text style={[s.badgeText, { color: c.badgeText }]}>{c.badge}</Text></View>
              <Text style={s.kicker} numberOfLines={1}>{c.kicker}</Text>
            </View>
            <View style={s.row}><PulseDot color={colors.lime} /><Text style={s.live}>en direct</Text></View>
          </View>
          <Text style={s.title}>{c.title}</Text>
          <Text style={s.sub}>{c.sub}</Text>
          <View style={s.bar}><View style={[s.barFill, { width: `${Math.round(c.pct * 100)}%` }]} /></View>
        </View>

        <TrainTrack stops={stops} state={state} now={now} />

        <Pressable onPress={demo} style={s.demo} accessibilityRole="button">
          <Text style={s.demoText}>Démo : faire avancer le trajet</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 18, paddingTop: 8, paddingBottom: 32, gap: 16 },
  boarding: { flex: 1, backgroundColor: colors.violet, padding: 24, justifyContent: 'space-between' },
  boardingTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 8 },
  boardingKicker: { fontFamily: fonts.bold, fontSize: 16, color: colors.violetSoft },
  boardingCode: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.lime, color: colors.ink, fontFamily: fonts.black, fontSize: 18, textAlign: 'center', textAlignVertical: 'center', overflow: 'hidden' },
  trackWindow: { height: 180, justifyContent: 'center', alignItems: 'center' },
  trackLine: { position: 'absolute', left: -24, right: -24, height: 12, borderRadius: 6, backgroundColor: '#FFFFFF', opacity: 0.25 },
  miniTrain: { flexDirection: 'row', alignItems: 'center', zIndex: 2 },
  trainCar: { width: 58, height: 92, borderRadius: 12, backgroundColor: colors.ink, borderWidth: 3, borderColor: '#FFFFFF', marginHorizontal: 2, alignItems: 'center', justifyContent: 'center' },
  trainHead: { height: 104, borderTopRightRadius: 28, borderBottomRightRadius: 28 },
  trainWindow: { width: 28, height: 18, borderRadius: 5, backgroundColor: colors.lime },
  boardingCopy: { gap: 6, paddingBottom: 24 },
  boardingTitle: { fontFamily: fonts.display, fontSize: 42, lineHeight: 44, color: '#FFFFFF', letterSpacing: -1 },
  boardingSub: { fontFamily: fonts.semi, fontSize: 18, color: colors.violetSoft },
  walkScreen: { flex: 1, backgroundColor: colors.lime, paddingHorizontal: 22, paddingTop: 12, paddingBottom: 28 },
  walkHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  walkFrom: { flex: 1, fontFamily: fonts.semi, fontSize: 15, color: colors.ink },
  walkTime: { backgroundColor: colors.ink, borderRadius: 999, paddingVertical: 7, paddingHorizontal: 12 },
  walkTimeText: { fontFamily: fonts.black, fontSize: 13, color: '#FFFFFF' },
  walkHero: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 },
  walkPerson: { width: 150, height: 150, borderRadius: 75, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  walkArrow: { fontFamily: fonts.display, fontSize: 74, lineHeight: 76, color: colors.ink },
  walkBottom: { gap: 8 },
  walkEyebrow: { fontFamily: fonts.black, fontSize: 14, color: colors.ink },
  walkTitle: { fontFamily: fonts.display, fontSize: 36, lineHeight: 38, color: colors.ink, letterSpacing: -0.8 },
  walkSub: { fontFamily: fonts.bold, fontSize: 17, color: '#3A3D46' },
  walkProgress: { height: 7, borderRadius: 4, backgroundColor: '#A8CC32', overflow: 'hidden', marginTop: 12 },
  walkProgressFill: { height: 7, borderRadius: 4, backgroundColor: colors.ink },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  arrLabel: { fontFamily: fonts.semi, fontSize: 13, color: colors.muted },
  arr: { fontFamily: fonts.display, fontSize: 24, color: colors.ink },
  card: { backgroundColor: colors.ink, borderRadius: 28, padding: 18, gap: 10 },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  badge: { width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontFamily: fonts.black, fontSize: 18 },
  kicker: { fontFamily: fonts.semi, fontSize: 14, color: '#D7D7DE', flexShrink: 1 },
  live: { fontFamily: fonts.bold, fontSize: 12, color: colors.lime },
  title: { fontFamily: fonts.display, fontSize: 32, color: '#FFFFFF', lineHeight: 34, letterSpacing: -0.5 },
  sub: { fontFamily: fonts.semi, fontSize: 16, color: colors.lime },
  bar: { height: 6, borderRadius: 3, backgroundColor: '#2A2C33', overflow: 'hidden' },
  barFill: { height: 6, borderRadius: 3, backgroundColor: colors.lime },
  demo: { alignSelf: 'center', height: 42, paddingHorizontal: 18, borderRadius: 999, borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#C9C9D3', justifyContent: 'center' },
  demoText: { fontFamily: fonts.semi, fontSize: 14, color: colors.muted },
});
