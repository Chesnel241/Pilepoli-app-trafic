import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { CloseButton, FullModal } from '../components/FullModal';
import { Text } from '../components/Text';
import * as Haptics from 'expo-haptics';
import * as Speech from 'expo-speech';
import * as Location from 'expo-location';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, router } from 'expo-router';
import { guideStops, hhmm, transitLegs, trip } from '../lib/trip';
import { computeGuide } from '../lib/guide';
import { localeTag, minutesWord } from '../lib/i18n';
import { fetchJourneys, fetchTraffic, fetchWalk, useOnline } from '../lib/api';
import { LEVEL, modeKey } from '../lib/lines';
import { cancelTrip, notifyNow, scheduleTrip } from '../lib/notify';
import { useI18n, useSettings } from '../lib/settings';
import type { Journey, LineTraffic } from '../lib/types';
import { LineBadge, PulseDot } from '../components/ui';
import { TrainTrack } from '../components/TrainTrack';
import { GuideView } from '../components/GuideView';
import { ModeAnimation } from '../components/ModeAnimation';
import { RouteCard, whereAmI } from '../components/RouteCard';
import { WalkNav } from '../components/WalkNav';
import type { Here } from '../components/TrainTrack';
import { useLiveLocation } from '../lib/location';
import { advance, buildModel, initTrack, notBoarded, type Track } from '../lib/tracker';
import { walkMinutes, walkPlan } from '../lib/walk';
import { RouteMap } from '../components/RouteMap';
import { BoardingCard } from '../components/BoardingCard';
import { useBoarding } from '../lib/boarding';
import { buildRoute } from '../lib/route';
import { colors, fonts, radius } from '../theme';

/**
 * Après Go : le guidage suit ce qui se passe VRAIMENT (GPS, montée constatée, heure réelle du train).
 * À pied : le GPS piéton. Sur le quai : « ton train ». À bord : arrêt par arrêt. Rien n'avance tout seul.
 */
export default function EnRoute() {
  const { t, lang } = useI18n();
  const { settings } = useSettings();
  const online = useOnline();
  const [j, setJ] = useState<Journey | null>(trip.current());
  const stops = useMemo(() => (j ? guideStops(j) : []), [j, lang]);
  const [tick, setTick] = useState(Date.now());
  const loc = useLiveLocation(true);
  const model = useMemo(() => (j ? buildModel(j) : []), [j]);
  const [track, setTrack] = useState<Track>(() => initTrack(model, Date.now()));
  useEffect(() => { setTrack(initTrack(model, Date.now())); }, [model]);
  const leaving = useRef(false);
  const [boarding, setBoarding] = useState(true);
  // Grand affichage pas à pas par défaut ; la liste des arrêts en un tap.
  const [view, setView] = useState<'guide' | 'list'>('guide');
  const [voiceOn, setVoiceOn] = useState(settings.voiceAuto);
  const [mapOpen, setMapOpen] = useState(false);
  const route = useMemo(() => (j ? buildRoute(j) : null), [j]);

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
    const id = setTimeout(() => setBoarding(false), 3000);
    return () => clearTimeout(id);
  }, []);

  const now = tick;
  const step = model[Math.min(track.step, model.length - 1)];
  // Le train à suivre : celui du quai où tu attends, ou celui vers lequel tu marches.
  const boardLeg = useMemo(() => {
    if (!step || track.sub === 'done') return undefined;
    if (track.sub === 'wait' && step.kind === 'ride') return step.leg;
    if (track.sub === 'walk') {
      const nxt = model[track.step + 1];
      return nxt?.kind === 'ride' ? nxt.leg : undefined;
    }
    return undefined;
  }, [model, track.step, track.sub]);
  const live = useBoarding(boardLeg, !!boardLeg);
  const departure = live?.mine ? Date.parse(live.mine.expectedAt ?? live.mine.aimedAt ?? '') || undefined : undefined;

  // Le suivi avance à chaque seconde, mais seulement sur preuve (voir lib/tracker).
  useEffect(() => {
    if (!model.length) return;
    setTrack((tr) => advance(model, tr, { now, fix: loc.fix, gps: loc.gps === 'denied' ? 'denied' : 'granted', departure: track.sub === 'wait' ? departure : undefined }));
  }, [now, loc.fix]);

  const state = computeGuide(stops, track.virtual);
  const previousPhase = useRef(state.phase);
  const previousStep = useRef(`${track.step}|${track.sub}`);

  const speak = useCallback((text: string) => {
    Speech.stop().catch(() => null);
    Speech.speak(text, { language: localeTag(lang), rate: 0.95 });
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

  // Voix : on annonce « ton train » (code mission, quai) une fois, puis MONTE / ATTENDS quand ça change.
  const spoken = useRef<string>('');
  useEffect(() => {
    if (!voiceOn || !live?.mine || !boardLeg) return;
    const m = live.mine;
    const code = /^[A-Z]{4}$/.test(m.mission ?? '') ? m.mission! : `${boardLeg.lineCode}, ${m.destination}`;
    const key = `${m.journeyRef}|${live.action ?? ''}`;
    if (spoken.current === key) return;
    spoken.current = key;
    if (live.action === 'board') speak(`${t('bt.board')}. ${t('bt.boardSub')}.`);
    else if (live.action === 'wait') speak(`${t('bt.wait')}. ${t('bt.waitSub', { n: Math.max(1, m.minutes ?? 1) })}.`);
    else speak(t('bt.speech', { code, platform: m.platform ? t('bt.platform', { p: m.platform }) : '', mins: minutesWord(Math.max(1, m.minutes ?? 1)) }));
  }, [live?.mine?.journeyRef, live?.action, voiceOn]);

  // Lecture de la première consigne si la voix est automatique.
  useEffect(() => {
    if (!boarding && voiceOn) speak(state.big.speech);
  }, [boarding]);

  // Changement d'étape réel (arrivé à la gare, monté, descendu) : vibration et voix.
  useEffect(() => {
    const key = `${track.step}|${track.sub}`;
    if (previousStep.current === key) return;
    previousStep.current = key;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => null);
    if (voiceOn && track.sub === 'wait' && step?.kind === 'ride') speak(t('walk.arrived') + '. ' + t('g.board', { line: step.leg.lineCode }) + '.');
  }, [track.step, track.sub]);

  // Une fois la montée constatée, les rappels sont recalés sur l'heure réelle.
  useEffect(() => {
    if (track.sub !== 'ride' || track.boardedAt === undefined) return;
    scheduleTrip(stops.map((st) => ({ ...st, at: st.at + track.shift })));
  }, [track.boardedAt]);

  // Arrivé : l'écran Sortie s'ouvre tout seul, les rappels restants sont annulés.
  useEffect(() => {
    // Seule la fin réelle du suivi déclenche l'arrivée (y compris la dernière marche jusqu'à destination).
    if (track.sub === 'done' && !leaving.current) {
      leaving.current = true;
      cancelTrip();
      const id = setTimeout(() => router.replace('/arrivee'), 1500);
      return () => clearTimeout(id);
    }
  }, [state.phase, track.sub]);

  // Surveillance du trafic toutes les minutes, sur les lignes qu'il reste à prendre.
  useEffect(() => {
    if (!j) return;
    let alive = true;
    const check = async () => {
      const report = await fetchTraffic();
      if (!alive || report.error) return;
      const nowMs = Date.now();
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
  }, [j]);

  const keep = () => {
    setAlert(null);
    setAlts(null);
  };

  const findOther = async () => {
    const ends = trip.endpoints();
    if (!ends || !alert) return;
    setSearching(true);
    const pos = await Location.getLastKnownPositionAsync().catch(() => null);
    const from = pos ? `${pos.coords.longitude.toFixed(6)};${pos.coords.latitude.toFixed(6)}` : ends.from;
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
    setJ(next);
    setAlert(null);
    setAlts(null);
    setBoarding(true);
    setTimeout(() => setBoarding(false), 2500);
  };

  // À pied, sorti du chemin plus de 15 s : nouveau chemin depuis ta position (au plus toutes les 30 s).
  const offSince = useRef<number | null>(null);
  const lastReroute = useRef(0);
  const onWalkStatus = async (st: import('../lib/walk').WalkStatus | null) => {
    if (!st || st.onRoute) { offSince.current = null; return; }
    offSince.current = offSince.current ?? Date.now();
    const cur = model[track.step];
    if (!loc.fix || cur?.kind !== 'walk' || Date.now() - offSince.current < 15_000 || Date.now() - lastReroute.current < 30_000) return;
    lastReroute.current = Date.now();
    const nxt = model[track.step + 1];
    const target = nxt?.kind === 'ride' && nxt.leg.fromId ? nxt.leg.fromId : cur.plan ? `${cur.plan.end[0].toFixed(6)};${cur.plan.end[1].toFixed(6)}` : null;
    if (!target) return;
    const leg = await fetchWalk(`${loc.fix.p[0].toFixed(6)};${loc.fix.p[1].toFixed(6)}`, target);
    const plan = leg ? walkPlan({ ...leg, to: cur.leg.to }) : null;
    if (!plan) return;
    cur.plan = plan; // le tronçon à pied suit maintenant le nouveau chemin
    offSince.current = null;
    setTrack((tr) => ({ ...tr, along: 0, alert: undefined, offSince: undefined }));
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


  const c = state.card;
  const canReroute = !!trip.endpoints();
  const ends = trip.endpoints();
  const toName = ends?.toName || j.legs[j.legs.length - 1]?.to || t('g.destination');
  // Le mode en cours : celui du tronçon où l'on est (marche pendant une correspondance).
  const curMode = track.sub === 'walk' ? 'walk' : step?.kind === 'ride' ? step.leg.mode : 'metro';
  const liveFix = loc.fix;
  const here = route ? whereAmI(route, track.virtual, liveFix) : null;
  const card = (h: number) => (
    <RouteCard journey={j} route={route} stops={stops} now={track.virtual} fix={liveFix} mode={curMode}
      onOpen={() => route && setMapOpen(true)} toName={toName} height={h} />
  );
  // Ce qu'on sait vraiment de ta position, pour la liste des arrêts.
  const walkLeft = step?.kind === 'walk' ? Math.max(0, (step.plan?.length ?? step.leg.durationMin * 75) - track.along) : 0;
  const trackHere: Here = track.sub === 'walk' ? { kind: 'walking', minutes: walkMinutes(walkLeft) }
    : track.source === 'gps' ? { kind: 'at' } : { kind: 'estimated' };
  const firstWalk = model[0]?.kind === 'walk' ? model[0] : undefined;

  /** Bandeaux d'alerte du suivi réel : mauvais sens, mauvais train, montée supposée. */
  const trackBanner = track.alert === 'wrongway' || track.alert === 'wrongtrain' ? (
    <View style={[s.alert, s.alertCut]} accessibilityLiveRegion="assertive">
      <Text style={[s.alertTitle, { color: '#FFFFFF' }]}>{t(track.alert === 'wrongway' ? 'track.wrongway' : 'track.wrongtrain')}</Text>
      <Text style={[s.alertSub, { color: '#D7D7DE' }]}>{track.alert === 'wrongway' ? t('track.wrongwaySub', { dir: step?.kind === 'ride' ? step.leg.direction : '' }) : t('track.wrongtrainSub')}</Text>
    </View>
  ) : track.sub === 'ride' && track.guessed && track.boardedAt && now - track.boardedAt < 6 * 60_000 ? (
    <View style={s.guess}>
      <Text style={s.guessText}>{t('track.boardedGuess', { time: hhmm(new Date(track.boardedAt).toISOString()) })}</Text>
      <Pressable onPress={() => setTrack((tr) => notBoarded(model, tr, Date.now(), live?.next ? Date.parse(live.next.at) : undefined))} hitSlop={8} accessibilityRole="button">
        <Text style={s.guessBtn}>{t('track.notBoarded')}</Text>
      </Pressable>
    </View>
  ) : null;
  return (
    <SafeAreaView style={s.screen}>
      <FullModal visible={boarding} transparent={false} animationType="fade" onRequestClose={() => setBoarding(false)}>
        <Pressable style={{ flex: 1 }} onPress={() => setBoarding(false)} accessibilityRole="button" accessibilityLabel={t('guide.startA11y')}>
          <SafeAreaView style={s.boarding}>
            <View style={s.boardingTop}>
              <Text style={s.boardingKicker}>{t('guide.start')}</Text>
              <Text style={s.boardingCode}>{stops[0]?.lineCode}</Text>
            </View>
            <View style={s.trackWindow}>
              {/* L'animation du transport que tu vas prendre : métro, bus, tram, téléphérique… */}
              <ModeAnimation mode={stops[0]?.mode ?? 'metro'} size={190} ink="#FFFFFF" glass={colors.violet} accent={colors.lime} playing={boarding} />
            </View>
            <View style={s.boardingCopy}>
              <Text style={s.boardingTitle}>{t('guide.letsGo')}</Text>
              <Text style={s.boardingSub}>{firstWalk ? t('walk.toStation', { name: firstWalk.leg.to.replace(/\s*\(.*\)$/, '') }) : `${c.title}, ${c.sub.charAt(0).toLowerCase() + c.sub.slice(1)}`}</Text>
            </View>
          </SafeAreaView>
        </Pressable>
      </FullModal>

      <View style={s.top}>
        <CloseButton onPress={quit} label={t('guide.quitShort')} />
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

      {route && mapOpen ? (
        <RouteMap visible={mapOpen} onClose={() => setMapOpen(false)} route={route} stops={stops} here={here?.p ?? null} source={here?.source ?? 'estime'} mode={curMode === 'walk' ? 'walk' : curMode} />
      ) : null}

      {trackBanner ? <View style={{ paddingHorizontal: 14, paddingBottom: 8 }}>{trackBanner}</View> : null}

      {view === 'guide' ? (
        <View style={s.guideArea}>
          {track.sub === 'walk' && step?.kind === 'walk' && step.plan ? (
            // À pied : le GPS piéton prend tout l'écran.
            <WalkNav plan={step.plan} live={loc} trainAt={departure ?? (boardLeg ? Date.parse(boardLeg.departureAt) : undefined)} onStatus={onWalkStatus} nextMode={boardLeg?.mode} />
          ) : track.sub === 'walk' || track.sub === 'wait' ? (
            // Sur le quai (ou marche sans tracé) : « ton train » d'abord.
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
              {track.sub === 'walk' && step?.kind === 'walk' ? (
                <View style={s.walkPlain}><Text style={s.walkPlainText}>{t('walk.toStation', { name: step.leg.to })} · {t('walk.minWalk', { n: walkMinutes(walkLeft) })}</Text></View>
              ) : null}
              {boardLeg ? <BoardingCard leg={boardLeg} b={live} /> : null}
              {card(150)}
            </ScrollView>
          ) : (
            <>
              {card(150)}
              <GuideView state={state} stops={stops} voiceOn={voiceOn} onVoice={toggleVoice} />
            </>
          )}
        </View>
      ) : (
        <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
          {/* En-tête compact : la consigne du moment en une ligne, pour laisser la place à la carte et aux arrêts. */}
          <View style={s.mini} accessibilityLiveRegion="polite">
            <View style={[s.badge, { backgroundColor: track.sub === 'walk' ? colors.lime : c.badgeColor }]}>
              <Text style={[s.badgeText, { color: track.sub === 'walk' ? colors.ink : c.badgeText }]}>{track.sub === 'walk' ? '🚶' : c.badge}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.miniTitle} numberOfLines={1}>{track.sub === 'walk' && step?.kind === 'walk' ? t('walk.toStation', { name: step.leg.to.replace(/\s*\(.*\)$/, '') }) : c.title}</Text>
              <Text style={s.miniSub} numberOfLines={1}>{track.sub === 'walk' ? t('walk.minWalk', { n: walkMinutes(walkLeft) }) : c.sub}</Text>
            </View>
            <View style={s.row}>
              {track.source === 'gps' ? <PulseDot color={colors.lime} /> : null}
              <Text style={s.live}>{track.source === 'gps' ? t('track.gps') : t('track.estimated')}</Text>
            </View>
          </View>
          {card(140)}
          {track.sub === 'wait' && boardLeg ? <BoardingCard leg={boardLeg} b={live} /> : null}
          <TrainTrack stops={stops} state={state} now={track.virtual} here={trackHere} />
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
  trackWindow: { height: 220, justifyContent: 'center', alignItems: 'center' },
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
  mini: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.ink, borderRadius: 20, paddingVertical: 10, paddingHorizontal: 12 },
  miniTitle: { fontFamily: fonts.display, fontSize: 17, color: '#FFFFFF' },
  miniSub: { fontFamily: fonts.semi, fontSize: 13, color: colors.lime },
  walkPlain: { backgroundColor: colors.lime, borderRadius: 18, padding: 14 },
  walkPlainText: { fontFamily: fonts.display, fontSize: 18, color: colors.ink },
  guess: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.amberBg, borderRadius: radius.md, padding: 12 },
  guessText: { flex: 1, fontFamily: fonts.semi, fontSize: 14, lineHeight: 19, color: colors.amberInk },
  guessBtn: { fontFamily: fonts.black, fontSize: 14, color: colors.ink, textDecorationLine: 'underline' },
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
});
