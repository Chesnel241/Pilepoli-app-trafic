import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as Location from 'expo-location';
import { fetchDepartures, searchPlaces } from '../lib/api';
import type { Place, RatedDeparture } from '../lib/types';
import { LineBadge, Logo, StatusChip } from '../components/ui';
import { IconHome, IconPin, IconSearch, IconWork } from '../components/icons';
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

  const go = (toId: string, toName: string) =>
    router.push({ pathname: '/choix', params: { from: from ?? 'mock:gare-du-nord', to: toId, toName } });

  const freshness = fetchedAt ? Math.max(0, Math.round((Date.now() - fetchedAt) / 1000)) : null;

  return (
    <SafeAreaView style={s.screen}>
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <Logo />
        <Text style={s.h1}>Bonsoir.{'\n'}On va où ?</Text>

        <View style={s.fromRow}>
          <IconPin />
          <Text style={s.fromText}>
            {locState === 'ok' ? 'Départ : ta position' : locState === 'pending' ? 'On cherche ta position…' : 'Position refusée, départ de démo'}
          </Text>
        </View>

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

        <View style={s.nearHead}>
          <Text style={s.h2}>Autour de toi</Text>
          <Text style={s.muted}>{freshness === null ? '…' : `à jour il y a ${freshness} s`}</Text>
        </View>
        {departures.map((d) => (
          <View key={d.journeyRef} style={s.dep}>
            <LineBadge code={d.lineCode} color={LINE_COLORS[d.lineCode] ?? '#FF7A1A'} textColor={LINE_COLORS[d.lineCode] ? '#FFFFFF' : colors.ink} />
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={s.depDest} numberOfLines={1}>{d.destination}</Text>
              <StatusChip reliability={d.reliability} label={d.label} />
            </View>
            <Text style={[s.depMin, d.reliability === 'pas_vu' && { color: colors.redInk }]}>
              {d.minutes === null || d.reliability === 'pas_vu' ? '?' : d.minutes}
              {d.minutes !== null && d.reliability !== 'pas_vu' ? <Text style={s.depUnit}> min</Text> : null}
            </Text>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, gap: 18 },
  h1: { fontFamily: fonts.display, fontSize: 40, lineHeight: 42, color: colors.ink, letterSpacing: -1 },
  h2: { fontFamily: fonts.bold, fontSize: 18, color: colors.ink },
  muted: { fontFamily: fonts.medium, fontSize: 14, color: colors.muted },
  fromRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: -8 },
  fromText: { fontFamily: fonts.semi, fontSize: 15, color: '#3A3D46' },
  search: { flexDirection: 'row', alignItems: 'center', gap: 12, height: 62, paddingHorizontal: 20, borderRadius: 20, backgroundColor: colors.soft },
  input: { flex: 1, fontFamily: fonts.medium, fontSize: 18, color: colors.ink },
  results: { borderRadius: radius.lg, backgroundColor: colors.soft, overflow: 'hidden' },
  result: { paddingVertical: 16, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: colors.line },
  resultText: { fontFamily: fonts.semi, fontSize: 17, color: colors.ink },
  favs: { flexDirection: 'row', gap: 12 },
  fav: { flex: 1, padding: 16, borderRadius: 22, gap: 18 },
  favLabel: { fontFamily: fonts.display, fontSize: 24, color: colors.ink },
  nearHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 4 },
  dep: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.line },
  depDest: { fontFamily: fonts.semi, fontSize: 16, color: colors.ink },
  depMin: { fontFamily: fonts.display, fontSize: 26, color: colors.ink },
  depUnit: { fontFamily: fonts.semi, fontSize: 15 },
});
