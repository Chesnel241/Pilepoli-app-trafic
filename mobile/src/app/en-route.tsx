import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../components/Text';
import * as Haptics from 'expo-haptics';
import * as Speech from 'expo-speech';
import * as Location from 'expo-location';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, router } from 'expo-router';
import { guideStops, hhmm, transitLegs, trip } from '../lib/trip';
import { computeGuide, nextDemoInstant } from '../lib/guide';
import { ALLOW_LOCAL, fetchJourneys, fetchTraffic, useOnline } from '../lib/api';
import { LEVEL, modeKey } from '../lib/lines';
import { cancelTrip, notifyNow, scheduleTrip } from '../lib/notify';
import { useI18n, useSettings } from '../lib/settings';
import type { Journey, LineTraffic } from '../lib/types';
import { IconButton, LineBadge, PulseDot } from '../components/ui';
import { IconClose } from '../components/icons';
import { TrainTrack } from '../components/TrainTrack';
import { GuideView } from '../components/GuideView';
import { colors, fonts, radius } from '../theme';

/** Après Go : la consigne du moment en haut, tous les arrêts en dessous. Rien à toucher. */
export default function EnRoute() {
  const { t, lang } = useI18n();
  const { settings } = useSettings();
  const online = useOnline();
  const [j, setJ] = useState<Journey | null>(trip.current());
  const stops = useMemo(() => (j ? guideStops(j) : []), [j, lang]);
  const [offset, setOffset] = useState(0); // décalage d'horloge pour la démo
  const [tick, setTick] = useState(Date.now());
  const leaving = useRef(false);
  const [boarding, setBoarding] = useState(true);
  // Grand affichage pas à pas par défaut ; la liste des arrêts en un tap.
  const [view, setView] = useState<'guide' | 'list'>('guide');
  const [voiceOn, setVoiceOn] = useState(settings.voiceAuto);
  const trainX = useRef(new Animated.Value(-160)).current;

  // Recalcul : une ligne du trajet perturbée, et les autres trajets possibles.
  const [alert, setAlert] = useState<LineTraffic | null>(null);
  /** Alertes déjà montrées (ligne + niveau) : on ne prévient qu'une fois, sauf si ça s'aggrave. */
  const shown = useRef(new Set<string>());
  const [alts, setAlts] = useState<Journey[] | null>(null);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Le trajet est gardé sur le téléphone et ses rappels programmés, même écran verrouillé.
  useEffect(() => {
    if (!j) return;
    trip.start();
    scheduleTrip(stops);
  }, [j, stops]);

  useEffect(() => {
    trainX.setValue(-160);
    const train = Animated.timing(trainX, { toValue: 160, duration: 2200, easing: Easing.inOut(Easing.cubic), useNativeDriver: true });
    train.start();
    const id = setTimeout(() => setBoarding(false), 3000);
    return () => { train.stop(); clearTimeout(id); };
  }, [trainX]);

  const now = tick + offset;
  const state = computeGuide(stops, now);
  const previousPhase = useRef(state.phase);

  const speak = useCallback((text: string) => {
    Speech.stop().catch(() => null);
    Speech.speak(text, { language: lang === 'en' ? 'en-GB' : 'fr-FR', rate: 0.95 });
  }, [lang]);

  useEffect(() => {
    if (previousPhase.current !== state.phase) {
      // Vibration légère à chaque étape ; l'alerte est réservée aux vrais problèmes.
      (state.phase === 'arrived'
        ? Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
        : Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
      ).catch(() => null);
      if (voiceOn) speak(state.big.speech);
      previousPhase.current = state.phase;
    }
  }, [state.phase]);

  // Lecture de la première consigne si la voix est automatique.
  useEffect(() => {
    if (!boarding && voiceOn) speak(state.big.speech);
  }, [boarding]);

  // Arrivé : l'écran Sortie s'ouvre tout seul, les rappels restants sont annulés.
  useEffect(() => {
    if (state.phase === 'arrived' && !leaving.current) {
      leaving.current = true;
      cancelTrip();
      const id = setTimeout(() => router.replace('/arrivee'), 1500);
      return () => clearTimeout(id);
    }
  }, [state.phase]);

  // Surveillance du trafic toutes les minutes, sur les lignes qu'il reste à prendre.
  useEffect(() => {
    if (!j) return;
    let alive = true;
    const check = async () => {
      const report = await fetchTraffic();
      if (!alive || report.error) return;
      const nowMs = Date.now() + offset;
      const ahead = transitLegs(j).filter((l) => Date.parse(l.arrivalAt) > nowMs);
      const hit = report.lines.find((tl) => (tl.level === 'perturbe' || tl.level === 'interrompu')
        && !shown.current.has(`${tl.lineId}:${tl.level}`)
        && ahead.some((l) => l.lineCode === tl.code && modeKey(l.mode, l.lineCode) === modeKey(tl.mode, tl.code)));
      if (hit) {
        shown.current.add(`${hit.lineId}:${hit.level}`);
        setAlert(hit);
        setAlts(null);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => null);
        if (hit.level === 'interrompu') notifyNow(t('notif.disruptTitle', { line: hit.code }), t('notif.disruptBody'));
      }
    };
    check();
    const id = setInterval(check, 60_000);
    return () => { alive = false; clearInterval(id); };
  }, [j, offset]);

  const keep = () => {
    setAlert(null);
    setAlts(null);
  };

  const findOther = async () => {
    const ends = trip.endpoints();
    if (!ends || !alert) return;
    setSearching(true);
    const pos = await Location.getLastKnownPositionAsync().catch(() => null);
    const from = pos ? `${pos.coords.longitude};${pos.coords.latitude}` : ends.from;
    const r = await fetchJourneys(from, ends.to);
    // On écarte les trajets qui reprennent la ligne perturbée.
    const avoid = alert;
    const list = r.journeys.filter((x) => !transitLegs(x).some((l) => l.lineCode === avoid.code && modeKey(l.mode, l.lineCode) === modeKey(avoid.mode, avoid.code)));
    setAlts(list.slice(0, 3));
    setSearching(false);
  };

  const switchTo = (next: Journey) => {
    trip.replace(next);
    leaving.current = false;
    setOffset(0);
    setJ(next);
    setAlert(null);
    setAlts(null);
    setBoarding(true);
    setTimeout(() => setBoarding(false), 2500);
  };

  const toggleVoice = () => {
    if (voiceOn) { Speech.stop().catch(() => null); setVoiceOn(false); }
    else { setVoiceOn(true); speak(state.big.speech); }
  };
  useEffect(() => () => { Speech.stop().catch(() => null); }, []);

  if (!j) return <Redirect href="/" />;

  const quit = () => {
    cancelTrip();
    trip.clear();
    router.back();
  };

  const demo = () => {
    const nxt = nextDemoInstant(stops, now);
    if (nxt) setOffset(nxt - Date.now());
  };

  const c = state.card;
  const canReroute = !!trip.endpoints();
  return (
    <SafeAreaView style={s.screen}>
      <Modal visible={boarding} transparent={false} animationType="fade" onRequestClose={() => setBoarding(false)}>
        <Pressable style={{ flex: 1 }} onPress={() => setBoarding(false)} accessibilityRole="button" accessibilityLabel={t('guide.startA11y')}>
          <SafeAreaView style={s.boarding}>
            <View style={s.boardingTop}>
              <Text style={s.boardingKicker}>{t('guide.start')}</Text>
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
              <Text style={s.boardingTitle}>{t('guide.letsGo')}</Text>
              <Text style={s.boardingSub}>{c.title}, {c.sub.charAt(0).toLowerCase() + c.sub.slice(1)}</Text>
            </View>
          </SafeAreaView>
        </Pressable>
      </Modal>

      <View style={s.top}>
        <IconButton label={t('guide.quit')} onPress={quit}><IconClose /></IconButton>
        <View style={s.switch} accessibilityRole="tablist">
          {(['guide', 'list'] as const).map((v) => (
            <Pressable key={v} onPress={() => setView(v)} accessibilityRole="tab" accessibilityState={{ selected: view === v }}
              style={[s.switchItem, view === v && s.switchOn]}>
              <Text style={[s.switchText, view === v && s.switchTextOn]}>{v === 'guide' ? t('guide.tabGuide') : t('guide.tabStops')}</Text>
            </Pressable>
          ))}
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={s.arrLabel}>{t('guide.arrival')}</Text>
          <Text style={s.arr}>{hhmm(j.arrivalAt)}</Text>
        </View>
      </View>

      {!online ? <View style={s.offline}><Text style={s.offlineText}>{t('guide.offline')}</Text></View> : null}

      {alert ? (
        <View style={[s.alert, alert.level === 'interrompu' && s.alertCut]} accessibilityLiveRegion="assertive">
          <View style={s.alertHead}>
            <LineBadge code={alert.code} color={alert.color} textColor={alert.textColor} size={34} round={modeKey(alert.mode, alert.code) === 'metro'} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[s.alertTitle, alert.level === 'interrompu' && { color: '#FFFFFF' }]}>
                {t(alert.level === 'interrompu' ? 'reroute.titleCut' : 'reroute.title', { line: alert.code })}
              </Text>
              {alert.disruptions[0]?.title ? (
                <Text style={[s.alertSub, alert.level === 'interrompu' && { color: '#D7D7DE' }]} numberOfLines={3}>{alert.disruptions[0].title}</Text>
              ) : null}
            </View>
          </View>

          {alts ? (
            alts.length === 0 ? (
              <Text style={[s.alertSub, alert.level === 'interrompu' && { color: '#FFFFFF' }]}>{t('reroute.noneBetter')}</Text>
            ) : (
              <View style={{ gap: 8 }}>
                {alts.map((x) => (
                  <Pressable key={x.id} onPress={() => switchTo(x)} style={s.alt} accessibilityRole="button">
                    <View style={s.altLines}>
                      {transitLegs(x).map((l, k) => <LineBadge key={k} code={l.lineCode} color={l.lineColor} textColor={l.lineTextColor} size={28} />)}
                    </View>
                    <Text style={s.altTime}>{x.durationMin} {t('common.min')} · {t('choice.arrival', { time: hhmm(x.arrivalAt) })}</Text>
                  </Pressable>
                ))}
              </View>
            )
          ) : null}

          <View style={s.alertActions}>
            {canReroute && !alts ? (
              <Pressable onPress={findOther} style={s.alertBtn} accessibilityRole="button" disabled={searching}>
                {searching ? <ActivityIndicator color={colors.ink} /> : <Text style={s.alertBtnText}>{t('reroute.find')}</Text>}
              </Pressable>
            ) : null}
            <Pressable onPress={keep} style={s.alertKeep} accessibilityRole="button">
              <Text style={[s.alertKeepText, alert.level === 'interrompu' && { color: '#FFFFFF' }]}>{t('reroute.keep')}</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {view === 'guide' ? (
        <View style={s.guideArea}>
          <GuideView state={state} stops={stops} voiceOn={voiceOn} onVoice={toggleVoice} />
          {ALLOW_LOCAL ? (
            <Pressable onPress={demo} style={s.demo} accessibilityRole="button">
              <Text style={s.demoText}>{t('guide.demo')}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : (
        <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
          <View style={s.card} accessibilityLiveRegion="polite">
            <View style={s.cardHead}>
              <View style={s.row}>
                <View style={[s.badge, { backgroundColor: c.badgeColor }]}><Text style={[s.badgeText, { color: c.badgeText }]}>{c.badge}</Text></View>
                <Text style={s.kicker} numberOfLines={1}>{c.kicker}</Text>
              </View>
              <View style={s.row}>
                {online ? <PulseDot color={colors.lime} /> : null}
                <Text style={s.live}>{online ? t('guide.live') : t('guide.planned')}</Text>
              </View>
            </View>
            <Text style={s.title}>{c.title}</Text>
            <Text style={s.sub}>{c.sub}</Text>
            <View style={s.bar}><View style={[s.barFill, { width: `${Math.round(c.pct * 100)}%` }]} /></View>
          </View>

          <TrainTrack stops={stops} state={state} now={now} />

          {ALLOW_LOCAL ? (
            <Pressable onPress={demo} style={s.demo} accessibilityRole="button">
              <Text style={s.demoText}>{t('guide.demo')}</Text>
            </Pressable>
          ) : null}
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
  offline: { marginHorizontal: 18, marginBottom: 8, backgroundColor: colors.amberBg, borderRadius: radius.md, paddingVertical: 8, paddingHorizontal: 12 },
  offlineText: { fontFamily: fonts.semi, fontSize: 14, color: colors.amberInk },
  alert: { marginHorizontal: 14, marginBottom: 10, backgroundColor: LEVEL.perturbe.bg, borderRadius: 22, padding: 14, gap: 12 },
  alertCut: { backgroundColor: colors.ink },
  alertHead: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  alertTitle: { fontFamily: fonts.display, fontSize: 19, lineHeight: 22, color: LEVEL.perturbe.fg },
  alertSub: { fontFamily: fonts.medium, fontSize: 14, lineHeight: 19, color: '#3A3D46' },
  alertActions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  alertBtn: { minHeight: 46, paddingHorizontal: 18, borderRadius: radius.pill, backgroundColor: colors.lime, alignItems: 'center', justifyContent: 'center' },
  alertBtnText: { fontFamily: fonts.black, fontSize: 15, color: colors.ink },
  alertKeep: { minHeight: 46, justifyContent: 'center', paddingHorizontal: 6 },
  alertKeepText: { fontFamily: fonts.bold, fontSize: 15, color: colors.ink },
  alt: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 12, gap: 8 },
  altLines: { flexDirection: 'row', gap: 6 },
  altTime: { fontFamily: fonts.bold, fontSize: 15, color: colors.ink },
  demo: { alignSelf: 'center', height: 42, paddingHorizontal: 18, borderRadius: 999, borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#C9C9D3', justifyContent: 'center' },
  demoText: { fontFamily: fonts.semi, fontSize: 14, color: colors.muted },
});
