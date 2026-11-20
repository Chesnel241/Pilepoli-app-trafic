import { useEffect, useRef, useState, type ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ActivityIndicator, AppState, Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text, TextInput, type TextInputHandle } from '../components/Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, router } from 'expo-router';
import * as Location from 'expo-location';
import { fetchNearby, fetchTraffic, searchPlaces, useOnline } from '../lib/api';
import { loadFavorites, saveFavorite, type FavKind, type Favorites } from '../lib/favorites';
import { depLabel, predictionLabel } from '../lib/labels';
import { getSettings, useI18n, useSettings } from '../lib/settings';
import { hhmm, trip } from '../lib/trip';
import type { Journey, NearbyStop, Place, RatedDeparture, TrafficReport } from '../lib/types';
import { NetworkDashboard } from '../components/NetworkDashboard';
import { NearbyMap } from '../components/NearbyMap';
import { BottomNav, LineBadge, Logo, StatusChip } from '../components/ui';
import { IconChevron, IconHome, IconPin, IconSearch, IconWork } from '../components/icons';
import { colors, fonts, radius } from '../theme';

const LINE_COLORS: Record<string, string> = { A: '#E3051C', B: '#3C91DC', C: '#FFCE00', D: '#00814F', E: '#C04191' };

export default function Home() {
  const { settings } = useSettings();
  const { t } = useI18n();
  const online = useOnline();
  const [from, setFrom] = useState<string | null>(null);
  const [coords, setCoords] = useState<{ lon: number; lat: number } | null>(null);
  const [locState, setLocState] = useState<'pending' | 'ok' | 'denied'>('pending');
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Place[]>([]);
  const [searching, setSearching] = useState(false);
  const [nearby, setNearby] = useState<NearbyStop[] | null>(null);
  const [report, setReport] = useState<TrafficReport | null>(null);
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
  const [recent, setRecent] = useState<{ id: string; name: string }[]>([]);
  const [favs, setFavs] = useState<Favorites>({});
  /** Quand on choisit l'adresse d'un favori, la recherche sert à l'enregistrer au lieu de partir. */
  const [favTarget, setFavTarget] = useState<FavKind | null>(null);
  const [resume, setResume] = useState<{ journey: Journey; endpoints: ReturnType<typeof trip.endpoints> } | null>(null);
  // Départ modifiable : par défaut la position, sinon un lieu choisi.
  const [customFrom, setCustomFrom] = useState<{ id: string; name: string } | null>(null);
  const [editingFrom, setEditingFrom] = useState(false);
  const [fromQ, setFromQ] = useState('');
  const [fromResults, setFromResults] = useState<Place[]>([]);
  const [opening, setOpening] = useState<string | null>(null);
  const searchRef = useRef<TextInputHandle>(null);

  useEffect(() => {
    AsyncStorage.getItem('pilepoil_recent_destinations')
      .then((value) => (value ? setRecent(JSON.parse(value)) : null))
      .catch(() => null);
    loadFavorites().then(setFavs);
    trip.stored().then(setResume);
  }, []);

  // Au retour dans l'appli (après avoir autorisé la position dans les réglages, ou après un déplacement),
  // on relit la position.
  const [locTick, setLocTick] = useState(0);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => { if (st === 'active') setLocTick((x) => x + 1); });
    return () => sub.remove();
  }, []);

  // Départ = position actuelle, sans rien demander d'autre au voyageur.
  useEffect(() => {
    if (!getSettings().onboarded) return;
    (async () => {
      // On ne redemande l'autorisation qu'au premier affichage ; ensuite on regarde seulement si elle a été donnée.
      const { status } = locTick === 0 ? await Location.requestForegroundPermissionsAsync() : await Location.getForegroundPermissionsAsync();
      if (status !== 'granted') return setLocState('denied');
      const last = await Location.getLastKnownPositionAsync().catch(() => null);
      if (last) {
        setFrom(`${last.coords.longitude};${last.coords.latitude}`);
        setCoords({ lon: last.coords.longitude, lat: last.coords.latitude });
        setLocState('ok');
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setFrom(`${pos.coords.longitude};${pos.coords.latitude}`);
      setCoords({ lon: pos.coords.longitude, lat: pos.coords.latitude });
      setLocState('ok');
    })().catch(() => setLocState((s) => (s === 'ok' ? s : 'denied')));
  }, [settings.onboarded, locTick]);

  // Arrêts proches et leurs prochains passages, rafraîchis toutes les 30 s (seulement si on a la position).
  useEffect(() => {
    if (!coords) return;
    let alive = true;
    const load = async () => {
      const stops = await fetchNearby(coords.lon, coords.lat);
      if (!alive || !stops) return; // moteur injoignable : on garde le dernier relevé, le bandeau hors ligne le dit
      setNearby(stops.filter((s) => s.departures.length > 0));
      setFetchedAt(Date.now());
    };
    load();
    const id = setInterval(load, 30_000);
    return () => { alive = false; clearInterval(id); };
  }, [coords]);

  // État du trafic, partagé par le moteur (une requête par minute suffit).
  useEffect(() => {
    let alive = true;
    const load = async () => { const r = await fetchTraffic(); if (alive) setReport(r); };
    load();
    const id = setInterval(load, 60_000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  // Recherche de destination pendant la frappe.
  useEffect(() => {
    if (q.trim().length < 2) return setResults([]);
    setSearching(true);
    const id = setTimeout(async () => {
      setResults(await searchPlaces(q));
      setSearching(false);
    }, 300);
    return () => clearTimeout(id);
  }, [q]);

  // Recherche du point de départ, seulement quand on le modifie.
  useEffect(() => {
    if (!editingFrom || fromQ.trim().length < 2) return setFromResults([]);
    const id = setTimeout(async () => setFromResults(await searchPlaces(fromQ)), 300);
    return () => clearTimeout(id);
  }, [fromQ, editingFrom]);

  if (!settings.onboarded && !getSettings().onboarded) return <Redirect href="/bienvenue" />;

  const pickFrom = (place: { id: string; name: string } | null) => {
    setCustomFrom(place);
    setEditingFrom(false);
    setFromQ('');
  };

  const go = (toId: string, toName: string) => {
    const next = [{ id: toId, name: toName }, ...recent.filter((item) => item.id !== toId)].slice(0, 3);
    setRecent(next);
    AsyncStorage.setItem('pilepoil_recent_destinations', JSON.stringify(next)).catch(() => null);
    const fromId = customFrom?.id ?? from ?? '';
    if (!fromId) { setEditingFrom(true); return; }
    trip.setEndpoints({ from: fromId, fromName: customFrom?.name ?? '', to: toId, toName });
    router.push({ pathname: '/choix', params: { from: fromId, fromName: customFrom?.name ?? '', to: toId, toName } });
  };

  const choose = async (p: Place) => {
    if (favTarget) {
      setFavs(await saveFavorite(favTarget, { id: p.id, name: p.name }));
      setFavTarget(null);
      setQ('');
      return;
    }
    go(p.id, p.name);
  };

  const askFav = (kind: FavKind) => {
    setFavTarget(kind);
    setQ('');
    searchRef.current?.focus();
  };

  // Un passage « Autour de toi » se touche : on part vers son terminus.
  const goToTerminus = async (d: RatedDeparture) => {
    setOpening(d.journeyRef);
    const [place] = await searchPlaces(d.destination);
    setOpening(null);
    if (place) go(place.id, place.name);
    else setQ(d.destination);
  };

  const resumeTrip = () => {
    if (!resume) return;
    trip.resume(resume);
    router.push('/en-route');
  };

  const row = (d: RatedDeparture) => {
    const pred = predictionLabel(d);
    return (
      <Pressable
        key={d.journeyRef}
        onPress={() => goToTerminus(d)}
        style={({ pressed }) => [s.dep, pressed && { opacity: 0.6 }]}
        accessibilityRole="button"
        accessibilityLabel={t('home.goTo', { dest: d.destination, line: d.lineCode })}
      >
        <LineBadge
          code={d.lineCode}
          color={d.lineColor ?? LINE_COLORS[d.lineCode] ?? '#FF7A1A'}
          textColor={d.lineTextColor ?? (LINE_COLORS[d.lineCode] ? '#FFFFFF' : colors.ink)}
          round={d.mode === 'metro'}
        />
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={s.depDest} numberOfLines={1}>{d.destination}</Text>
          {/* Le libellé dit l'âge de l'info, jamais plus que ce qu'on sait. */}
          <StatusChip reliability={d.reliability} label={depLabel(d)} />
          {pred ? <Text style={s.pred} numberOfLines={2}>{pred}</Text> : null}
        </View>
        <Text style={[s.depMin, d.reliability === 'pas_vu' && { color: colors.redInk }]}>
          {d.minutes === null || d.reliability === 'pas_vu' ? '?' : d.minutes}
          {d.minutes !== null && d.reliability !== 'pas_vu' ? <Text style={s.depUnit}> {t('common.min')}</Text> : null}
        </Text>
        {opening === d.journeyRef ? <ActivityIndicator color={colors.violet} /> : <IconChevron />}
      </Pressable>
    );
  };


  const freshness = fetchedAt ? Math.max(0, Math.round((Date.now() - fetchedAt) / 1000)) : null;
  const favTile = (kind: FavKind, bg: string, fg: string, icon: ReactNode, label: string) => {
    const f = favs[kind];
    return (
      <Pressable
        style={[s.fav, { backgroundColor: bg }, favTarget === kind && s.favActive]}
        onPress={() => (f ? go(f.id, f.name) : askFav(kind))}
        onLongPress={() => askFav(kind)}
        accessibilityRole="button"
        accessibilityLabel={f ? `${label}, ${f.name}` : `${label}, ${t('home.setFav')}`}
        accessibilityHint={f ? t('home.favEdit') : undefined}
      >
        {icon}
        <View>
          <Text style={[s.favLabel, { color: fg }]}>{label}</Text>
          <Text style={[s.favSub, { color: fg }]} numberOfLines={1}>{f ? f.name : t('home.setFav')}</Text>
        </View>
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={s.screen}>
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={s.header}>
          <Logo />
          <Pressable onPress={() => router.push('/reglages')} hitSlop={12} accessibilityRole="button" accessibilityLabel={t('home.settings')} style={s.settingsBtn}>
            <Text style={s.settingsText}>Aa</Text>
          </Pressable>
        </View>

        {resume ? (
          <Pressable style={s.resume} onPress={resumeTrip} accessibilityRole="button">
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={s.resumeTitle}>{t('home.resume')}</Text>
              <Text style={s.resumeSub} numberOfLines={1}>{t('home.resumeTo', { name: resume.endpoints?.toName ?? resume.journey.legs[resume.journey.legs.length - 1]?.to ?? '', time: hhmm(resume.journey.arrivalAt) })}</Text>
            </View>
            <IconChevron />
          </Pressable>
        ) : null}

        {!online ? <View style={s.offline}><Text style={s.offlineText}>{t('home.offline')}</Text></View> : null}

        {/* D'abord l'état du trafic autour de toi : c'est ce qu'on vient chercher le plus souvent. */}
        {locState === 'denied' ? (
          <View style={s.needLoc}>
            <Text style={s.needLocText}>{t('dash.needLocation')}</Text>
            <Pressable onPress={() => Linking.openSettings()} style={s.needLocBtn} accessibilityRole="button">
              <Text style={s.needLocBtnText}>{t('dash.openSettings')}</Text>
            </Pressable>
          </View>
        ) : (
          <NetworkDashboard nearby={nearby} report={report} />
        )}

        <Text style={s.h1} accessibilityRole="header">{t('home.where')}</Text>

        {editingFrom ? (
          <View style={{ gap: 8 }}>
            <View style={[s.search, s.fromSearch]}>
              <IconPin />
              <TextInput
                value={fromQ}
                onChangeText={setFromQ}
                placeholder={t('home.fromPlaceholder')}
                placeholderTextColor={colors.muted}
                style={s.input}
                autoFocus
                returnKeyType="done"
                accessibilityLabel={t('home.fromLabel')}
              />
              <Pressable onPress={() => setEditingFrom(false)} hitSlop={10} accessibilityRole="button">
                <Text style={s.fromEdit}>{t('home.cancel')}</Text>
              </Pressable>
            </View>
            <View style={s.results}>
              {locState === 'ok' ? (
                <Pressable onPress={() => pickFrom(null)} style={s.result} accessibilityRole="button">
                  <Text style={[s.resultText, { color: colors.violet }]}>{t('home.myPosition')}</Text>
                </Pressable>
              ) : null}
              {fromResults.map((p) => (
                <Pressable key={p.id} onPress={() => pickFrom({ id: p.id, name: p.name })} style={s.result} accessibilityRole="button">
                  <Text style={s.resultText}>{p.name}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : (
          <Pressable style={s.fromRow} onPress={() => setEditingFrom(true)} accessibilityRole="button" accessibilityLabel={t('home.editFrom')}>
            <IconPin />
            <Text style={s.fromText} numberOfLines={1}>
              {customFrom
                ? t('home.fromCustom', { name: customFrom.name })
                : locState === 'ok' ? t('home.fromPosition') : locState === 'pending' ? t('home.fromPending') : t('home.fromPick')}
            </Text>
            <Text style={s.fromEdit}>{t('home.edit')}</Text>
          </Pressable>
        )}

        <View style={[s.search, favTarget && s.searchFav]}>
          <IconSearch />
          <TextInput
            ref={searchRef}
            value={q}
            onChangeText={setQ}
            placeholder={favTarget ? t('home.favSetting', { name: favTarget === 'home' ? t('home.home') : t('home.work') }) : t('home.toPlaceholder')}
            placeholderTextColor={colors.muted}
            style={s.input}
            returnKeyType="go"
            onSubmitEditing={() => results[0] && choose(results[0])}
            accessibilityLabel={t('home.destination')}
          />
          {searching ? <ActivityIndicator color={colors.violet} /> : null}
          {favTarget ? (
            <Pressable onPress={() => { setFavTarget(null); setQ(''); }} hitSlop={10} accessibilityRole="button">
              <Text style={s.fromEdit}>{t('home.cancel')}</Text>
            </Pressable>
          ) : null}
        </View>

        {results.length > 0 ? (
          <View style={s.results}>
            {results.map((p) => (
              <Pressable key={p.id} onPress={() => choose(p)} style={s.result} accessibilityRole="button">
                <Text style={s.resultText}>{p.name}</Text>
              </Pressable>
            ))}
          </View>
        ) : (
          <>
            <View style={s.favs}>
              {favTile('home', colors.violet, '#FFFFFF', <IconHome />, t('home.home'))}
              {favTile('work', colors.lime, colors.ink, <IconWork />, t('home.work'))}
            </View>
            {recent.length > 0 ? (
              <View style={s.recent}>
                {recent.slice(0, 2).map((item) => (
                  <Pressable key={item.id} style={s.recentItem} onPress={() => go(item.id, item.name)} accessibilityRole="button">
                    <IconPin size={16} />
                    <Text style={s.recentText} numberOfLines={1}>{item.name}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </>
        )}

        {nearby && nearby.length ? <NearbyMap stops={nearby} me={coords} /> : null}

        <View style={s.nearHead}>
          <Text style={s.h2}>{t('home.nearby')}</Text>
          <View style={s.freshness}>
            <View style={s.freshDot} />
            <Text style={s.muted}>{freshness === null ? t('home.refreshing') : t('home.upToDate', { s: freshness })}</Text>
          </View>
        </View>
        {nearby && nearby.length === 0 ? <Text style={s.muted}>{t('home.noNearby')}</Text> : null}
        {nearby ? nearby.map((stop) => {
          const stale = stop.anomalies?.find((a) => a.kind === 'stale_feed');
          return (
            <View key={stop.stopRef} style={{ gap: 2 }}>
              <Pressable
                style={s.stopHead}
                onPress={() => router.push({ pathname: '/arret', params: { ref: stop.stopRef, area: stop.areaNumber, name: stop.name } })}
                accessibilityRole="button"
                accessibilityLabel={t('home.seeStop', { name: stop.name })}
              >
                <Text style={s.stopName} numberOfLines={1}>{stop.name}</Text>
                <Text style={s.stopDist}>{t('home.walk', { n: Math.max(1, Math.round(stop.distance / 80)) })}</Text>
                {stale ? <View style={s.staleDot} accessibilityLabel="!" /> : null}
                <IconChevron />
              </Pressable>
              {stop.departures.slice(0, 3).map(row)}
            </View>
          );
        }) : null}
      </ScrollView>
      <BottomNav active="aller" />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 120, gap: 16 },
  header: { height: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  settingsBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.soft, alignItems: 'center', justifyContent: 'center' },
  settingsText: { fontFamily: fonts.display, fontSize: 17, color: colors.ink },
  h1: { fontFamily: fonts.display, fontSize: 30, lineHeight: 33, color: colors.ink, letterSpacing: -0.8, marginTop: 4 },
  h2: { fontFamily: fonts.bold, fontSize: 18, color: colors.ink },
  muted: { fontFamily: fonts.medium, fontSize: 14, color: colors.muted },
  resume: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.ink, borderRadius: radius.md, padding: 16 },
  resumeTitle: { fontFamily: fonts.display, fontSize: 19, color: colors.lime },
  resumeSub: { fontFamily: fonts.semi, fontSize: 14, color: '#FFFFFF' },
  needLoc: { backgroundColor: colors.ink, borderRadius: radius.lg, padding: 16, gap: 12 },
  needLocText: { fontFamily: fonts.semi, fontSize: 16, lineHeight: 22, color: '#FFFFFF' },
  needLocBtn: { alignSelf: 'flex-start', backgroundColor: colors.lime, borderRadius: radius.pill, paddingVertical: 10, paddingHorizontal: 16 },
  needLocBtnText: { fontFamily: fonts.black, fontSize: 14, color: colors.ink },
  offline: { backgroundColor: colors.amberBg, borderRadius: radius.md, padding: 12 },
  offlineText: { fontFamily: fonts.semi, fontSize: 14, lineHeight: 19, color: colors.amberInk },
  fromRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: -8 },
  fromText: { flexShrink: 1, fontFamily: fonts.semi, fontSize: 15, color: '#3A3D46' },
  fromEdit: { fontFamily: fonts.bold, fontSize: 14, color: colors.violet, marginLeft: 4 },
  fromSearch: { minHeight: 52 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 58, paddingHorizontal: 18, borderRadius: 18, backgroundColor: colors.soft, borderWidth: 1, borderColor: colors.line },
  searchFav: { borderColor: colors.violet, borderWidth: 2 },
  input: { flex: 1, fontFamily: fonts.medium, fontSize: 18, color: colors.ink, paddingVertical: 12 },
  results: { borderRadius: radius.lg, backgroundColor: colors.soft, overflow: 'hidden' },
  result: { paddingVertical: 16, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: colors.line },
  resultText: { fontFamily: fonts.semi, fontSize: 17, color: colors.ink },
  favs: { flexDirection: 'row', gap: 10 },
  fav: { flex: 1, minHeight: 92, padding: 14, borderRadius: 18, gap: 8, justifyContent: 'space-between' },
  favActive: { borderWidth: 3, borderColor: colors.ink },
  favLabel: { fontFamily: fonts.display, fontSize: 20 },
  favSub: { fontFamily: fonts.medium, fontSize: 13, opacity: 0.85 },
  nearHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 4 },
  freshness: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  freshDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.lime },
  stopHead: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 10, paddingBottom: 2 },
  stopName: { flex: 1, fontFamily: fonts.bold, fontSize: 14, color: colors.muted, letterSpacing: 0.3 },
  stopDist: { fontFamily: fonts.semi, fontSize: 13, color: colors.muted },
  staleDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#E0A000' },
  dep: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, minHeight: 76, borderBottomWidth: 1, borderBottomColor: colors.line },
  depDest: { fontFamily: fonts.semi, fontSize: 16, color: colors.ink },
  pred: { fontFamily: fonts.medium, fontSize: 12, color: colors.muted },
  depMin: { fontFamily: fonts.display, fontSize: 26, color: colors.ink },
  depUnit: { fontFamily: fonts.semi, fontSize: 15 },
  recent: { flexDirection: 'row', gap: 10 },
  recentItem: { flex: 1, minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.soft, borderRadius: 16, paddingHorizontal: 14 },
  recentText: { flex: 1, fontFamily: fonts.semi, fontSize: 15, color: colors.ink },
});
