import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as Location from 'expo-location';
import { fetchDepartures, searchPlaces } from '../lib/api';
import type { Place, RatedDeparture } from '../lib/types';
import { LineBadge, Logo, StatusChip } from '../components/ui';
import { IconChevron, IconHome, IconPin, IconSearch, IconWork } from '../components/icons';
import { colors, fonts, radius } from '../theme';

/** Arrêt affiché dans « Autour de toi » en attendant la recherche de l'arrêt le plus proche (v2). */
const DEMO_STOP = process.env.EXPO_PUBLIC_DEMO_STOP ?? 'STIF:StopArea:SP:DEMO:';

const LINE_COLORS: Record<string, string> = { A: '#E3051C', B: '#3C91DC', C: '#FFCE00', D: '#00814F', E: '#C04191' };

export default function Home() {
  const [from, setFrom] = useState<string | null>(null);
  const [locState, setLocState] = useState<'pending' | 'ok' | 'denied'>('pending');
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Place[]>([]);
  const [searching, setSearching] = useState(false);
  const [departures, setDepartures] = useState<RatedDeparture[]>([]);
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
  const [recent, setRecent] = useState<{ id: string; name: string }[]>([]);
  // Départ modifiable : par défaut la position, sinon un lieu choisi.
  const [customFrom, setCustomFrom] = useState<{ id: string; name: string } | null>(null);
  const [editingFrom, setEditingFrom] = useState(false);
  const [fromQ, setFromQ] = useState('');
  const [fromResults, setFromResults] = useState<Place[]>([]);

  useEffect(() => {
    AsyncStorage.getItem('pilepoil_recent_destinations')
      .then((value) => value ? setRecent(JSON.parse(value)) : null)
      .catch(() => null);
  }, []);

  // Départ = position actuelle, sans rien demander d'autre au voyageur.
  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return setLocState('denied');
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setFrom(`${pos.coords.longitude};${pos.coords.latitude}`);
      setLocState('ok');
    })().catch(() => setLocState('denied'));
  }, []);

  // Prochains passages rafraîchis toutes les 30 s.
  useEffect(() => {
    let alive = true;
    const load = async () => {
      const snap = await fetchDepartures(DEMO_STOP);
      if (!alive) return;
      setDepartures(snap.departures.slice(0, 3));
      setFetchedAt(Date.parse(snap.fetchedAt));
    };
    load();
    const id = setInterval(load, 30_000);
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

  const pickFrom = (place: { id: string; name: string } | null) => {
    setCustomFrom(place);
    setEditingFrom(false);
    setFromQ('');
  };

  // Un passage « Autour de toi » se touche : on part vers son terminus.
  const [opening, setOpening] = useState<string | null>(null);
  const goToTerminus = async (d: RatedDeparture) => {
    setOpening(d.journeyRef);
    const [place] = await searchPlaces(d.destination);
    setOpening(null);
    if (place) go(place.id, place.name);
    else { setQ(d.destination); }
  };

  const go = (toId: string, toName: string) => {
    const next = [{ id: toId, name: toName }, ...recent.filter((item) => item.id !== toId)].slice(0, 3);
    setRecent(next);
    AsyncStorage.setItem('pilepoil_recent_destinations', JSON.stringify(next)).catch(() => null);
    router.push({
      pathname: '/choix',
      params: { from: customFrom?.id ?? from ?? 'mock:gare-du-nord', fromName: customFrom?.name ?? '', to: toId, toName },
    });
  };

  const freshness = fetchedAt ? Math.max(0, Math.round((Date.now() - fetchedAt) / 1000)) : null;
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Bonjour.' : hour < 18 ? 'Bon après-midi.' : 'Bonsoir.';

  return (
    <SafeAreaView style={s.screen}>
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={s.header}><Logo /></View>
        <Text style={s.h1}>{greeting}{'\n'}On va où ?</Text>

        {editingFrom ? (
          <View style={{ gap: 8 }}>
            <View style={[s.search, s.fromSearch]}>
              <IconPin />
              <TextInput
                value={fromQ}
                onChangeText={setFromQ}
                placeholder="D’où tu pars ?"
                placeholderTextColor={colors.muted}
                style={s.input}
                autoFocus
                returnKeyType="done"
                accessibilityLabel="Point de départ"
              />
              <Pressable onPress={() => setEditingFrom(false)} hitSlop={10} accessibilityRole="button">
                <Text style={s.fromEdit}>Annuler</Text>
              </Pressable>
            </View>
            <View style={s.results}>
              {locState === 'ok' ? (
                <Pressable onPress={() => pickFrom(null)} style={s.result} accessibilityRole="button">
                  <Text style={[s.resultText, { color: colors.violet }]}>Ma position actuelle</Text>
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
          <Pressable style={s.fromRow} onPress={() => setEditingFrom(true)} accessibilityRole="button" accessibilityLabel="Modifier le point de départ">
            <IconPin />
            <Text style={s.fromText} numberOfLines={1}>
              {customFrom
                ? `Départ : ${customFrom.name}`
                : locState === 'ok' ? 'Départ : ta position' : locState === 'pending' ? 'On cherche ta position…' : 'Choisis ton point de départ'}
            </Text>
            <Text style={s.fromEdit}>Modifier</Text>
          </Pressable>
        )}

        <View style={s.search}>
          <IconSearch />
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder="Une adresse, une gare…"
            placeholderTextColor={colors.muted}
            style={s.input}
            returnKeyType="go"
            onSubmitEditing={() => results[0] && go(results[0].id, results[0].name)}
            accessibilityLabel="Destination"
          />
          {searching ? <ActivityIndicator color={colors.violet} /> : null}
        </View>

        {results.length > 0 ? (
          <View style={s.results}>
            {results.map((p) => (
              <Pressable key={p.id} onPress={() => go(p.id, p.name)} style={s.result} accessibilityRole="button">
                <Text style={s.resultText}>{p.name}</Text>
              </Pressable>
            ))}
          </View>
        ) : (
          <>
            {recent.length > 0 ? (
              <View style={s.recent}>
                {recent.slice(0, 2).map((item) => (
                  <Pressable key={item.id} style={s.recentItem} onPress={() => go(item.id, item.name)} accessibilityRole="button">
                    <IconPin size={16} />
                    <Text style={s.recentText} numberOfLines={1}>{item.name}</Text>
                  </Pressable>
                ))}
              </View>
            ) : (
              <View style={s.favs}>
                <Pressable style={[s.fav, { backgroundColor: colors.violet }]} onPress={() => go('mock:maison', 'Maison')} accessibilityRole="button">
                  <IconHome />
                  <Text style={[s.favLabel, { color: '#FFFFFF' }]}>Maison</Text>
                </Pressable>
                <Pressable style={[s.fav, { backgroundColor: colors.lime }]} onPress={() => go('mock:la-defense', 'La Défense')} accessibilityRole="button">
                  <IconWork />
                  <Text style={s.favLabel}>Taf</Text>
                </Pressable>
              </View>
            )}
          </>
        )}

        <View style={s.nearHead}>
          <Text style={s.h2}>Autour de toi</Text>
          <View style={s.freshness}><View style={s.freshDot} /><Text style={s.muted}>{freshness === null ? 'Actualisation…' : `à jour, ${freshness}s`}</Text></View>
        </View>
        {departures.map((d) => (
          <Pressable
            key={d.journeyRef}
            onPress={() => goToTerminus(d)}
            style={({ pressed }) => [s.dep, pressed && { opacity: 0.6 }]}
            accessibilityRole="button"
            accessibilityLabel={`Aller vers ${d.destination} avec la ligne ${d.lineCode}`}
          >
            <LineBadge
              code={d.lineCode}
              color={d.lineColor ?? LINE_COLORS[d.lineCode] ?? '#FF7A1A'}
              textColor={d.lineTextColor ?? (LINE_COLORS[d.lineCode] ? '#FFFFFF' : colors.ink)}
              round={d.mode === 'metro'}
            />
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={s.depDest} numberOfLines={1}>{d.destination}</Text>
              {/* Le libellé vient du moteur : il dit l'âge de l'info, jamais plus que ce qu'on sait. */}
              <StatusChip reliability={d.reliability} label={d.label} />
            </View>
            <Text style={[s.depMin, d.reliability === 'pas_vu' && { color: colors.redInk }]}>
              {d.minutes === null || d.reliability === 'pas_vu' ? '?' : d.minutes}
              {d.minutes !== null && d.reliability !== 'pas_vu' ? <Text style={s.depUnit}> min</Text> : null}
            </Text>
            {opening === d.journeyRef ? <ActivityIndicator color={colors.violet} /> : <IconChevron />}
          </Pressable>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 32, gap: 16 },
  header: { height: 44, justifyContent: 'center' },
  h1: { fontFamily: fonts.display, fontSize: 38, lineHeight: 40, color: colors.ink, letterSpacing: -1 },
  h2: { fontFamily: fonts.bold, fontSize: 18, color: colors.ink },
  muted: { fontFamily: fonts.medium, fontSize: 14, color: colors.muted },
  fromRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: -8 },
  fromText: { flexShrink: 1, fontFamily: fonts.semi, fontSize: 15, color: '#3A3D46' },
  fromEdit: { fontFamily: fonts.bold, fontSize: 14, color: colors.violet, marginLeft: 4 },
  fromSearch: { height: 52 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 12, height: 58, paddingHorizontal: 18, borderRadius: 18, backgroundColor: colors.soft, borderWidth: 1, borderColor: colors.line },
  input: { flex: 1, fontFamily: fonts.medium, fontSize: 18, color: colors.ink },
  results: { borderRadius: radius.lg, backgroundColor: colors.soft, overflow: 'hidden' },
  result: { paddingVertical: 16, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: colors.line },
  resultText: { fontFamily: fonts.semi, fontSize: 17, color: colors.ink },
  favs: { flexDirection: 'row', gap: 10 },
  fav: { flex: 1, height: 82, padding: 14, borderRadius: 18, gap: 8, justifyContent: 'space-between' },
  favLabel: { fontFamily: fonts.display, fontSize: 20, color: colors.ink },
  nearHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 4 },
  freshness: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  freshDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.lime },
  dep: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, minHeight: 76, borderBottomWidth: 1, borderBottomColor: colors.line },
  depDest: { fontFamily: fonts.semi, fontSize: 16, color: colors.ink },
  depMin: { fontFamily: fonts.display, fontSize: 26, color: colors.ink },
  depUnit: { fontFamily: fonts.semi, fontSize: 15 },
  recent: { flexDirection: 'row', gap: 10 },
  recentItem: { flex: 1, height: 52, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.soft, borderRadius: 16, paddingHorizontal: 14 },
  recentText: { flex: 1, fontFamily: fonts.semi, fontSize: 15, color: colors.ink },
});
