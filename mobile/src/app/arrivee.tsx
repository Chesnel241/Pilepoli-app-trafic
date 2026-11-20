import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { trip } from '../lib/trip';
import { BigButton } from '../components/ui';
import { IconArrowLeft, IconEscalator } from '../components/icons';
import { colors, fonts } from '../theme';

/** Arrivée : la sortie à prendre, en énorme, visible même en descendant du train. */
export default function Arrivee() {
  const j = trip.current();
  const lastLeg = j?.legs.filter((l) => l.mode !== 'walk').pop();
  const exitTip = lastLeg?.tips.find((t) => t.startsWith('Sortie'));
  const [exitLabel, exitPlace] = exitTip ? exitTip.split(',').map((x) => x.trim()) : [null, null];
  const exitNum = exitLabel?.replace('Sortie', '').trim();

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
        <View style={s.chip}><Text style={s.chipText}>Tu es à {lastLeg?.to ?? 'destination'}</Text></View>
        <Text style={s.lead}>{exitNum ? 'En descendant, prends la' : 'Tu es arrivé'}</Text>
        {exitNum ? (
          <View style={s.exitRow}>
            <Animated.View style={[s.exitBadge, { transform: [{ translateY: bob.interpolate({ inputRange: [0, 1], outputRange: [0, -5] }) }] }]}>
              <Text style={s.exitWord}>SORTIE</Text>
              <Text style={s.exitNum}>{exitNum}</Text>
            </Animated.View>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={s.place}>{exitPlace ?? ''}</Text>
            </View>
          </View>
        ) : (
          <Text style={s.place}>Suis les panneaux Sortie.</Text>
        )}
      </SafeAreaView>

      <SafeAreaView edges={['bottom']} style={s.body}>
        <View style={s.step}>
          <View style={[s.stepIcon, { backgroundColor: colors.ink }]}><IconArrowLeft /></View>
          <Text style={s.stepText}>Descends et suis le panneau {exitNum ?? 'Sortie'}</Text>
        </View>
        <View style={s.step}>
          <View style={s.stepIcon}><IconEscalator /></View>
          <Text style={s.stepText}>Escalator, puis la sortie</Text>
        </View>
        <View style={{ flex: 1 }} />
        <Text style={s.note}>Les numéros de sortie viendront des données des gares (v0.2).</Text>
        <BigButton label="Terminer" tone="ink" onPress={() => router.dismissAll()} />
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
  note: { fontFamily: fonts.medium, fontSize: 13, color: colors.muted, textAlign: 'center' },
});
