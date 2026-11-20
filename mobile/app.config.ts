import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Configuration finale de l'appli : app.json, plus les secrets lus dans les variables d'environnement EAS
 * (jamais écrits dans le dépôt).
 * - GOOGLE_MAPS_ANDROID_KEY : clé Google Maps pour la carte sur Android (iPhone : Apple Plans, sans clé).
 */
export default ({ config }: ConfigContext): ExpoConfig => {
  const mapsKey = process.env.GOOGLE_MAPS_ANDROID_KEY;
  return {
    ...(config as ExpoConfig),
    android: {
      ...config.android,
      ...(mapsKey ? { config: { ...config.android?.config, googleMaps: { apiKey: mapsKey } } } : {}),
    },
  };
};
