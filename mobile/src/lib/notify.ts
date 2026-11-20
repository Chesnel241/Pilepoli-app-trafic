import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { localExit, t } from './i18n';
import { getSettings } from './settings';
import { hhmm, type GuideStop } from './trip';

/**
 * Notifications du trajet, entièrement locales : programmées sur le téléphone au moment du Go,
 * elles arrivent même écran verrouillé ou appli fermée, sans serveur ni compte.
 * Elles suivent les horaires du trajet ; un recalcul les reprogramme.
 */
const CHANNEL = 'trajet';
let configured = false;

export function configureNotifications() {
  if (configured) return;
  configured = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
  if (Platform.OS === 'android') {
    Notifications.setNotificationChannelAsync(CHANNEL, {
      name: t('notif.channel'),
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 150, 250],
    }).catch(() => null);
  }
}

/** Demande l'autorisation seulement si elle n'a jamais été refusée. Renvoie true si on peut notifier. */
export async function ensureNotificationPermission(ask = true): Promise<boolean> {
  try {
    const cur = await Notifications.getPermissionsAsync();
    if (cur.granted) return true;
    if (!ask || !cur.canAskAgain) return false;
    const req = await Notifications.requestPermissionsAsync();
    return req.granted;
  } catch {
    return false;
  }
}

async function at(date: number, title: string, body: string) {
  if (date < Date.now() + 10_000) return; // déjà passé ou trop proche : l'écran de guidage s'en charge
  await Notifications.scheduleNotificationAsync({
    content: { title, body, sound: true, data: { kind: 'trajet' } },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(date), channelId: CHANNEL },
  });
}

/** Programme les rappels du trajet : avant chaque montée, avant chaque descente, à l'arrivée. */
export async function scheduleTrip(stops: GuideStop[]): Promise<void> {
  await cancelTrip();
  if (!getSettings().notifications || stops.length === 0) return;
  if (!(await ensureNotificationPermission(false))) return;
  try {
    for (let i = 0; i < stops.length; i++) {
      const s = stops[i];
      const prev = stops[i - 1];
      const boarding = i === 0 || prev?.walkAfter;
      if (boarding && !s.end) {
        await at(s.at - 2 * 60_000, t('notif.departTitle', { line: s.lineCode, n: 2 }), t('notif.departBody', { dir: s.direction, time: hhmm(new Date(s.at).toISOString()) }));
      }
      if (s.walkAfter && stops[i + 1]) {
        await at(s.at - 90_000, t('notif.getOffTitle'), t('notif.changeBody', { name: s.name, line: stops[i + 1].lineCode }));
      }
      if (s.end) {
        await at(s.at - 90_000, t('notif.getOffTitle'), t('notif.getOffBody', { name: s.name }));
        await at(s.at, t('notif.arriveTitle', { name: s.name }), s.exit ? t('notif.arriveBody', { exit: localExit(s.exit).toLowerCase() }) : t('notif.arriveBodyNoExit'));
      }
    }
  } catch (e) {
    console.warn('Notifications non programmées', e);
  }
}

export async function cancelTrip(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync().catch(() => null);
}

/** Alerte immédiate (ligne coupée pendant le trajet). */
export async function notifyNow(title: string, body: string): Promise<void> {
  if (!getSettings().notifications || !(await ensureNotificationPermission(false))) return;
  await Notifications.scheduleNotificationAsync({
    content: { title, body, sound: true, data: { kind: 'alerte' } },
    trigger: Platform.OS === 'android' ? { channelId: CHANNEL } : null,
  }).catch(() => null);
}
