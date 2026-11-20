import AsyncStorage from '@react-native-async-storage/async-storage';

/** Adresses favorites (Maison, Taf), gardées sur le téléphone uniquement. */
export type FavKind = 'home' | 'work';
export interface Fav { id: string; name: string }
export type Favorites = Partial<Record<FavKind, Fav>>;

const KEY = 'pilepoil_favorites';

export async function loadFavorites(): Promise<Favorites> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Favorites) : {};
  } catch {
    return {};
  }
}

export async function saveFavorite(kind: FavKind, fav: Fav): Promise<Favorites> {
  const next = { ...(await loadFavorites()), [kind]: fav };
  await AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => null);
  return next;
}

export async function clearFavorites(): Promise<void> {
  await AsyncStorage.removeItem(KEY).catch(() => null);
}
