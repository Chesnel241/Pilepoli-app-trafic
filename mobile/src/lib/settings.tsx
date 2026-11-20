import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';
import { deviceLang, setLang, t, tn, type Lang } from './i18n';

/** Réglages d'accessibilité et de confort, gardés sur le téléphone uniquement. */
export interface Settings {
  textScale: 1 | 1.2 | 1.4;
  contrast: boolean;
  voiceAuto: boolean;
  notifications: boolean;
  lang: 'auto' | Lang;
  onboarded: boolean;
}

const DEFAULTS: Settings = { textScale: 1, contrast: false, voiceAuto: false, notifications: true, lang: 'auto', onboarded: false };
const KEY = 'pilepoil_settings';

let snapshot: Settings = DEFAULTS;
/** Lecture hors React (notifications, guidage). */
export const getSettings = () => snapshot;

const Ctx = createContext<{ settings: Settings; update: (patch: Partial<Settings>) => void; ready: boolean }>({
  settings: DEFAULTS, update: () => {}, ready: false,
});

function apply(s: Settings) {
  snapshot = s;
  setLang(s.lang === 'auto' ? deviceLang() : s.lang);
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((raw) => {
        const s = raw ? { ...DEFAULTS, ...JSON.parse(raw) } : DEFAULTS;
        apply(s);
        setSettings(s);
      })
      .catch(() => apply(DEFAULTS))
      .finally(() => setReady(true));
  }, []);

  // Retour au premier plan : la langue du téléphone a pu changer entre-temps (réglages système).
  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => {
      if (st !== 'active' || snapshot.lang !== 'auto') return;
      apply(snapshot);
      setSettings({ ...snapshot });
    });
    return () => sub.remove();
  }, []);

  const update = useCallback((patch: Partial<Settings>) => {
    // Appliqué tout de suite (et pas au prochain rendu) : l'écran suivant lit déjà la bonne valeur.
    const next = { ...snapshot, ...patch };
    apply(next);
    setSettings(next);
    AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => null);
  }, []);

  return <Ctx.Provider value={{ settings, update, ready }}>{children}</Ctx.Provider>;
}

export const useSettings = () => useContext(Ctx);

/** Abonne un écran aux réglages (langue, taille) pour qu'il se redessine quand ils changent. */
export function useI18n() {
  const { settings } = useContext(Ctx);
  return { t, tn, lang: settings.lang === 'auto' ? deviceLang() : settings.lang };
}
