import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import Constants from 'expo-constants';
import { Text } from '../components/Text';
import { IconButton } from '../components/ui';
import { IconBack } from '../components/icons';
import { clearFavorites } from '../lib/favorites';
import { cancelTrip, ensureNotificationPermission } from '../lib/notify';
import { useI18n, useSettings, type Settings } from '../lib/settings';
import { colors, fonts, radius } from '../theme';

/** Réglages : peu de choses, mais celles qui comptent pour bien lire et bien entendre. */
export default function Reglages() {
  const { t } = useI18n();
  const { settings, update } = useSettings();
  const [cleared, setCleared] = useState(false);

  const toggleNotifs = async (on: boolean) => {
    if (on) {
      const ok = await ensureNotificationPermission(true);
      update({ notifications: ok });
    } else {
      update({ notifications: false });
      cancelTrip();
    }
  };

  const seg = <K extends keyof Settings>(key: K, options: [Settings[K], string][]) => (
    <View style={s.seg} accessibilityRole="radiogroup">
      {options.map(([v, label]) => {
        const on = settings[key] === v;
        return (
          <Pressable key={String(v)} onPress={() => update({ [key]: v } as Partial<Settings>)} style={[s.segItem, on && s.segOn]}
            accessibilityRole="radio" accessibilityState={{ checked: on }}>
            <Text style={[s.segText, on && s.segTextOn]}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );

  const toggle = (title: string, sub: string, value: boolean, onChange: (v: boolean) => void) => (
    <View style={s.row}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={s.rowTitle}>{title}</Text>
        <Text style={s.rowSub}>{sub}</Text>
      </View>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: colors.violet, false: '#C9C9D3' }} thumbColor="#FFFFFF"
        accessibilityLabel={title} />
    </View>
  );

  return (
    <SafeAreaView style={s.screen}>
      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <IconButton label={t('common.back')} onPress={() => router.back()}><IconBack /></IconButton>
        <Text style={s.h1} accessibilityRole="header">{t('set.title')}</Text>

        <View style={s.block}>
          <Text style={s.label}>{t('set.text')}</Text>
          {seg('textScale', [[1, t('set.textNormal')], [1.2, t('set.textLarge')], [1.4, t('set.textXL')]])}
          <Text style={[s.preview]}>Aa · {t('home.where')}</Text>
        </View>

        <View style={s.card}>
          {toggle(t('set.contrast'), t('set.contrastSub'), settings.contrast, (v) => update({ contrast: v }))}
          <View style={s.sep} />
          {toggle(t('set.voice'), t('set.voiceSub'), settings.voiceAuto, (v) => update({ voiceAuto: v }))}
          <View style={s.sep} />
          {toggle(t('set.notifs'), t('set.notifsSub'), settings.notifications, toggleNotifs)}
        </View>

        <View style={s.block}>
          <Text style={s.label}>{t('set.lang')}</Text>
          {seg('lang', [['auto', t('set.langAuto')], ['fr', 'Français'], ['en', 'English']])}
        </View>

        <Pressable style={s.link} onPress={async () => { await clearFavorites(); setCleared(true); }} accessibilityRole="button">
          <Text style={s.linkText}>{cleared ? t('set.favsDone') : t('set.favs')}</Text>
        </Pressable>
        <Pressable style={s.link} onPress={() => router.push('/confidentialite')} accessibilityRole="button">
          <Text style={s.linkText}>{t('set.privacy')}</Text>
        </Pressable>

        <Text style={s.version}>{t('set.version', { v: Constants.expoConfig?.version ?? '' })}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 40, gap: 20 },
  h1: { fontFamily: fonts.display, fontSize: 38, lineHeight: 40, color: colors.ink, letterSpacing: -1 },
  block: { gap: 10 },
  label: { fontFamily: fonts.bold, fontSize: 15, color: colors.muted },
  seg: { flexDirection: 'row', backgroundColor: colors.soft, borderRadius: radius.pill, padding: 4 },
  segItem: { flex: 1, minHeight: 46, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  segOn: { backgroundColor: colors.ink },
  segText: { fontFamily: fonts.bold, fontSize: 15, color: colors.ink, textAlign: 'center' },
  segTextOn: { color: '#FFFFFF' },
  preview: { fontFamily: fonts.display, fontSize: 24, color: colors.ink },
  card: { backgroundColor: colors.soft, borderRadius: radius.lg, paddingHorizontal: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 16 },
  rowTitle: { fontFamily: fonts.bold, fontSize: 17, color: colors.ink },
  rowSub: { fontFamily: fonts.medium, fontSize: 14, lineHeight: 19, color: colors.muted },
  sep: { height: 1, backgroundColor: colors.line },
  link: { minHeight: 52, justifyContent: 'center' },
  linkText: { fontFamily: fonts.bold, fontSize: 16, color: colors.violet },
  version: { fontFamily: fonts.medium, fontSize: 13, color: colors.muted, textAlign: 'center' },
});
