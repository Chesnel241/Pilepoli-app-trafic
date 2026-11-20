import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as Location from 'expo-location';
import { Text } from '../components/Text';
import { BigButton } from '../components/ui';
import { Wordmark } from '../components/Wordmark';
import { ensureNotificationPermission } from '../lib/notify';
import { useI18n, useSettings } from '../lib/settings';
import { colors, fonts } from '../theme';

/**
 * Bienvenue, en trois écrans courts. Chaque autorisation est demandée au moment où on explique
 * à quoi elle sert, et on peut toujours dire « plus tard » : l'appli marche sans.
 */
export default function Bienvenue() {
  const { t } = useI18n();
  const { update } = useSettings();
  const [step, setStep] = useState(0);

  const finish = () => {
    update({ onboarded: true });
    router.replace('/');
  };

  const askLocation = async () => {
    await Location.requestForegroundPermissionsAsync().catch(() => null);
    setStep(2);
  };
  const askNotifs = async () => {
    const ok = await ensureNotificationPermission(true);
    update({ notifications: ok, onboarded: true });
    router.replace('/');
  };

  const pages = [
    { bg: colors.violet, fg: '#FFFFFF', title: t('onb.title1'), body: t('onb.body1') },
    { bg: colors.lime, fg: colors.ink, title: t('onb.title2'), body: t('onb.body2') },
    { bg: colors.ink, fg: '#FFFFFF', title: t('onb.title3'), body: t('onb.body3') },
  ];
  const p = pages[step];

  return (
    <View style={[s.screen, { backgroundColor: p.bg }]}>
      <SafeAreaView style={s.inner}>
        <View style={s.top}>
          <Wordmark height={30} ink={p.fg} dot1={step === 0 ? "#FFFFFF" : colors.violet} dot2={step === 1 ? colors.ink : colors.lime} />
          <View style={s.dots} accessibilityLabel={`${step + 1} / 3`}>
            {pages.map((_, i) => <View key={i} style={[s.dot, { backgroundColor: p.fg, opacity: i === step ? 1 : 0.3 }]} />)}
          </View>
        </View>

        <View style={s.copy}>
          <Text style={[s.title, { color: p.fg }]} accessibilityRole="header">{p.title}</Text>
          <Text style={[s.body, { color: p.fg }]}>{p.body}</Text>
        </View>

        <View style={s.actions}>
          {step === 0 ? <BigButton label={t('onb.next')} tone="lime" onPress={() => setStep(1)} /> : null}
          {step === 1 ? <BigButton label={t('onb.allowLoc')} tone="ink" onPress={askLocation} /> : null}
          {step === 2 ? <BigButton label={t('onb.allowNotif')} tone="lime" onPress={askNotifs} /> : null}
          {step > 0 ? (
            <Pressable onPress={() => (step === 1 ? setStep(2) : finish())} style={s.later} accessibilityRole="button">
              <Text style={[s.laterText, { color: p.fg }]}>{t('onb.later')}</Text>
            </Pressable>
          ) : null}
        </View>
      </SafeAreaView>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1 },
  inner: { flex: 1, padding: 24, justifyContent: 'space-between' },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 8 },
  dots: { flexDirection: 'row', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  copy: { gap: 16 },
  title: { fontFamily: fonts.display, fontSize: 44, lineHeight: 46, letterSpacing: -1 },
  body: { fontFamily: fonts.semi, fontSize: 19, lineHeight: 27 },
  actions: { gap: 6, paddingBottom: 8 },
  later: { height: 52, alignItems: 'center', justifyContent: 'center' },
  laterText: { fontFamily: fonts.bold, fontSize: 16 },
});
