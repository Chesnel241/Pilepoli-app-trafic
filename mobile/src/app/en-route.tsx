import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import * as Speech from 'expo-speech';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, router } from 'expo-router';
import { guideStops, hhmm, trip } from '../lib/trip';
import { computeGuide, nextDemoInstant } from '../lib/guide';
import { IconButton, PulseDot } from '../components/ui';
import { IconClose } from '../components/icons';
import { TrainTrack } from '../components/TrainTrack';
import { GuideView } from '../components/GuideView';
import { colors, fonts } from '../theme';

/** Après Go : la consigne du moment en haut, tous les arrêts en dessous. Rien à toucher. */
export default function EnRoute() {
  const j = trip.current();
  const stops = useMemo(() => (j ? guideStops(j) : []), [j]);
  const [offset, setOffset] = useState(0); // décalage d'horloge pour la démo
  const [tick, setTick] = useState(Date.now());
  const leaving = useRef(false);
  const [boarding, setBoarding] = useState(true);
  // Grand affichage pas à pas par défaut ; la liste des arrêts en un tap.
  const [view, setView] = useState<'guide' | 'list'>('guide');
  const [voiceOn, setVoiceOn] = useState(false);
  const trainX = useRef(new Animated.Value(-160)).current;

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


  const now = tick + offset;
  const state = computeGuide(stops, now);
  const previousPhase = useRef(state.phase);

  useEffect(() => {
    if (previousPhase.current !== state.phase) {
      // Vibration légère à chaque étape ; l'alerte est réservée aux vrais problèmes (train supprimé, mauvais train).
      (state.phase === 'arrived'
        ? Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
        : Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
      ).catch(() => null);
      if (voiceOn) speak(state.big.speech);
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

  const speak = (text: string) => {
    Speech.stop().catch(() => null);
    Speech.speak(text, { language: 'fr-FR', rate: 0.95 });
  };
  const toggleVoice = () => {
    if (voiceOn) { Speech.stop().catch(() => null); setVoiceOn(false); }
    else { setVoiceOn(true); speak(state.big.speech); }
  };
  useEffect(() => () => { Speech.stop().catch(() => null); }, []);

  if (!j) return <Redirect href="/" />;

  const demo = () => {
    const nxt = nextDemoInstant(stops, now);
    if (nxt) setOffset(nxt - Date.now());
  };

  const c = state.card;
  return (
    <SafeAreaView style={s.screen}>
      <Modal visible={boarding} transparent={false} animationType="fade" onRequestClose={() => setBoarding(false)}>
        <Pressable style={{ flex: 1 }} onPress={() => setBoarding(false)} accessibilityRole="button" accessibilityLabel="Commencer le guidage">
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
            <Text style={s.boardingTitle}>C’est parti.</Text>
            <Text style={s.boardingSub}>{c.title}, {c.sub.charAt(0).toLowerCase() + c.sub.slice(1)}</Text>
          </View>
        </SafeAreaView>
        </Pressable>
      </Modal>


      <View style={s.top}>
        <IconButton label="Quitter le guidage" onPress={() => router.back()}><IconClose /></IconButton>
        <View style={s.switch} accessibilityRole="tablist">
          {(['guide', 'list'] as const).map((v) => (
            <Pressable
              key={v}
              onPress={() => setView(v)}
              accessibilityRole="tab"
              accessibilityState={{ selected: view === v }}
              style={[s.switchItem, view === v && s.switchOn]}
            >
              <Text style={[s.switchText, view === v && s.switchTextOn]}>{v === 'guide' ? 'Guidage' : 'Arrêts'}</Text>
            </Pressable>
          ))}
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={s.arrLabel}>Arrivée</Text>
          <Text style={s.arr}>{hhmm(j.arrivalAt)}</Text>
        </View>
      </View>

      {view === 'guide' ? (
        <View style={s.guideArea}>
          <GuideView state={state} stops={stops} voiceOn={voiceOn} onVoice={toggleVoice} />
          <Pressable onPress={demo} style={s.demo} accessibilityRole="button">
            <Text style={s.demoText}>Démo : faire avancer le trajet</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
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
      )}
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
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 18, paddingTop: 8, paddingBottom: 12, gap: 10 },
  guideArea: { flex: 1, paddingHorizontal: 14, paddingBottom: 8, gap: 10 },
  switch: { flexDirection: 'row', backgroundColor: colors.soft, borderRadius: 999, padding: 4 },
  switchItem: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 999 },
  switchOn: { backgroundColor: colors.ink },
  switchText: { fontFamily: fonts.bold, fontSize: 14, color: colors.muted },
  switchTextOn: { color: '#FFFFFF' },
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
