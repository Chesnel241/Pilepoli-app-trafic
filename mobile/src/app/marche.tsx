import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Text } from '../components/Text';
import { BigButton } from '../components/ui';
import { CloseButton } from '../components/FullModal';
import { WalkNav } from '../components/WalkNav';
import { fetchWalk, stopRefOf } from '../lib/api';
import { meters } from '../lib/geo';
import { useLiveLocation } from '../lib/location';
import { useI18n } from '../lib/settings';
import { walkPlan, type WalkPlan, type WalkStatus } from '../lib/walk';
import { colors, fonts } from '../theme';

/**
 * « Y aller à pied » : le GPS piéton vers une station (ou un point), depuis ta position réelle.
 * Le chemin est recalculé tout seul si tu t'en écartes.
 */
export default function Marche() {
  const { to, name, lat, lon, area } = useLocalSearchParams<{ to: string; name?: string; lat?: string; lon?: string; area?: string }>();
  const { t } = useI18n();
  const loc = useLiveLocation(true);
  const [plan, setPlan] = useState<WalkPlan | null>(null);
  const [failed, setFailed] = useState(false);
  const [arrived, setArrived] = useState(false);
  const lastRoute = useRef(0);
  const offSince = useRef<number | null>(null);
  const dest = lat && lon ? ([Number(lon), Number(lat)] as [number, number]) : null;
  const already = !!(dest && loc.fix && meters(loc.fix.p, dest) < 60);

  const route = async (from: [number, number]) => {
    lastRoute.current = Date.now();
    const leg = await fetchWalk(`${from[0].toFixed(6)};${from[1].toFixed(6)}`, String(to));
    const p = leg ? walkPlan({ ...leg, to: name ?? leg.to }) : null;
    if (p) { setPlan(p); setFailed(false); } else if (!plan) setFailed(true);
  };

  // Premier calcul dès la première position.
  useEffect(() => {
    if (loc.fix && !plan && !failed && Date.now() - lastRoute.current > 5_000 && !already) route(loc.fix.p);
  }, [loc.fix, already]);

  // Écart de chemin pendant plus de 15 s : nouveau chemin depuis là où tu es (au plus toutes les 30 s).
  const onStatus = (st: WalkStatus | null) => {
    if (!st) return;
    if (st.arrived) setArrived(true);
    if (st.onRoute) { offSince.current = null; return; }
    offSince.current = offSince.current ?? Date.now();
    if (loc.fix && Date.now() - offSince.current > 15_000 && Date.now() - lastRoute.current > 30_000) route(loc.fix.p);
  };

  const openStop = () => {
    if (area) router.replace({ pathname: '/arret', params: { ref: stopRefOf(String(to)), area, name } });
    else router.back();
  };

  return (
    <SafeAreaView style={s.screen}>
      <View style={s.top}>
        <CloseButton onPress={() => router.back()} light={false} />
        <Text style={s.title} numberOfLines={1}>{t('walk.title')}</Text>
      </View>
      <View style={s.body}>
        {already || arrived ? (
          <View style={s.done}>
            <Text style={s.doneTitle}>{already ? t('walk.here') : t('walk.arrived')}</Text>
            <Text style={s.doneSub}>{name}</Text>
            {area ? <BigButton label={t('stop.seeAll')} tone="ink" onPress={openStop} /> : null}
          </View>
        ) : plan ? (
          <WalkNav plan={plan} live={loc} onStatus={onStatus} />
        ) : loc.gps === 'denied' ? (
          <Text style={s.info}>{t('dash.needLocation')}</Text>
        ) : failed ? (
          <Text style={s.info}>{t('walk.none')}</Text>
        ) : (
          <View style={s.loading}><ActivityIndicator color={colors.violet} /><Text style={s.info}>{t('walk.preparing')}</Text></View>
        )}
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 8 },
  title: { flex: 1, fontFamily: fonts.display, fontSize: 22, color: colors.ink },
  body: { flex: 1, paddingHorizontal: 14, paddingBottom: 10 },
  done: { flex: 1, justifyContent: 'center', gap: 14, padding: 10 },
  doneTitle: { fontFamily: fonts.display, fontSize: 40, lineHeight: 43, color: colors.ink },
  doneSub: { fontFamily: fonts.semi, fontSize: 20, color: colors.muted },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  info: { fontFamily: fonts.semi, fontSize: 16, lineHeight: 22, color: colors.muted, textAlign: 'center', padding: 20 },
});
