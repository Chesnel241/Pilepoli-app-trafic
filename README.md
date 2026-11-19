# Pilepoil

**Pile-poil à l'heure.** Métro, RER, bus, simple et à l'heure.
L'app de transport d'Île-de-France qui te guide sans que tu touches l'écran, et qui te dit honnêtement quand une info n'est pas sûre.

Ce dépôt contient la **version 0.1** :

| Dossier | Rôle |
|---|---|
| `engine/` | Le moteur de fiabilité (Node.js + TypeScript). Il interroge PRIM (Île-de-France Mobilités), classe chaque passage (En direct, Estimé, Pas vu, Horaire prévu, Supprimé), détecte les anomalies (passage en avance, course disparue, flux figé) et garde l'historique. |
| `mobile/` | L'app (React Native + Expo). Accueil, choix du trajet, trajet en détail, guidage « En route » avec le train sur la voie, écran Sortie. |

## Lancer le projet

Il faut Node.js 22 ou plus récent.

### 1. Le moteur

```bash
cd engine
npm install
cp .env.example .env      # puis remplis PRIM_API_KEY et passe DATA_MODE=prim quand tu as la clé
npm run dev               # http://localhost:8787
npm test                  # tests du moteur
```

Sans clé PRIM, le moteur tourne avec des **données simulées** (le scénario de la maquette).

Routes disponibles :

- `GET /health`
- `GET /stops/:stopRef/departures` (exemple de stopRef : `STIF:StopArea:SP:XXXXX:`)
- `GET /journeys?from=...&to=...` (from et to : identifiant Navitia ou `longitude;latitude`)
- `GET /places?q=...`

### 2. L'app

```bash
cd mobile
npm install
cp .env.example .env      # EXPO_PUBLIC_ENGINE_URL = adresse du moteur
npx expo start            # scanne le QR code avec Expo Go sur ton téléphone
```

Sur un vrai téléphone, `localhost` ne marche pas : mets l'IP locale de ton ordinateur dans `EXPO_PUBLIC_ENGINE_URL` (par exemple `http://192.168.1.20:8787`).
Si le moteur ne répond pas, l'app bascule seule sur des données locales et l'indique à l'écran.

## Obtenir la clé PRIM

1. Crée un compte sur https://prim.iledefrance-mobilites.fr
2. Abonne-toi aux API « Prochains passages (requête unitaire) » et « Calculateur Île-de-France Mobilités, accès générique (v2) »
3. Génère ton jeton dans ton espace et colle-le dans `engine/.env`

La clé ne doit **jamais** être committée : `.env` est ignoré par git.

## Principes du moteur

- On ne présente jamais une estimation comme un fait.
- L'absence de signal n'est pas une suppression : une course disparue est « à vérifier ».
- Le maillon le plus faible donne la fiabilité d'un trajet.
- Des règles simples et testées d'abord, les modèles prédictifs ensuite, quand l'historique sera suffisant.

Seuils de fraîcheur actuels (dans `engine/src/reliability/freshness.ts`) : En direct jusqu'à 60 s, Estimé jusqu'à 3 min, Pas vu au-delà.

## Ce qui viendra ensuite (v0.2)

- Détection automatique « tu es monté », « mauvais train », y compris en souterrain (capteurs du téléphone).
- Arrêt le plus proche pour « Autour de toi » (aujourd'hui un arrêt de démo, réglable avec `EXPO_PUBLIC_DEMO_STOP`).
- Numéros de sortie et d'accès réels à partir des données des gares.
- Prédictions à partir de l'historique, notifications et écran verrouillé (Live Activities).
- Mode simple et « Aide-moi » pour les proches.
