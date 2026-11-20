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
cp .env.example .env      # puis remplis PRIM_API_KEY (obligatoire)
npm run dev               # http://localhost:8787
npm test                  # tests du moteur
```

Le moteur ne sert que des données réelles PRIM : sans clé, il refuse de démarrer.

Routes disponibles :

- `GET /health` (état du moteur, de PRIM et du référentiel des lignes)
- `GET /stops/:stopRef/departures` (exemple de stopRef : `STIF:StopArea:SP:71410:`)
- `GET /stops/:zone/exits` (sorties d'une gare)
- `GET /nearby?lon=...&lat=...` (stations proches et leurs passages)
- `GET /journeys?from=...&to=...` (from et to : identifiant Navitia ou `longitude;latitude`)
- `GET /places?q=...`
- `GET /traffic` (info trafic de toutes les lignes)

### 2. L'app

```bash
cd mobile
npm install
cp .env.example .env      # EXPO_PUBLIC_ENGINE_URL = adresse du moteur
npx expo start            # scanne le QR code avec Expo Go sur ton téléphone
```

Sur un vrai téléphone, `localhost` ne marche pas : mets l'IP locale de ton ordinateur dans `EXPO_PUBLIC_ENGINE_URL` (par exemple `http://192.168.1.20:8787`).
Si le moteur ne répond pas, l'app le dit (« pas de connexion ») et garde le trajet en cours : elle n'invente jamais de données.

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

## Prédictions

Le moteur apprend des passages réels (`engine/src/store/stats.ts`) : pour chaque ligne, arrêt, type de jour et heure, il garde les derniers retards observés juste avant le départ. Au-delà de 8 observations, il annonce le retard habituel et celui d'un mauvais jour. L'appli l'affiche seulement quand l'heure n'est pas déjà du temps réel frais, toujours au conditionnel (« D'habitude +3 min à cette heure »). Les apprentissages sont gardés dans `data/stats.json`.

## Mise en production

- Brancher et vérifier les vraies données, pas à pas : `deploy/TEMPS-REEL.md`.
- Moteur sur un VPS : voir `deploy/LISEZ-MOI.md` (Docker, Nginx, HTTPS, sécurité).
- Appli sur les stores : même fichier, partie « Stores » (EAS Build).
- Confidentialité : `PRIVACY.md` (à publier, son adresse sert de lien dans les stores).

## Ce qui viendra ensuite

- Détection automatique « tu es monté », « mauvais train », y compris en souterrain (capteurs du téléphone).
- Écran verrouillé en direct (Live Activities iOS, notification permanente Android).
- Mode « Aide-moi » pour les proches.

## Identité visuelle

Le kit de marque est dans `brand/kit/` (logos SVG et PNG, icônes iOS, Android et web, visuels réseaux sociaux, flyers, intro vidéo, charte PDF). Voir `brand/kit/LISEZ-MOI.md`.
Les scripts qui génèrent tout le kit sont dans `brand/generateur/` : `npm install`, puis `node gen-logo-icons.mjs`, `node gen-com.mjs`, `node gen-video.mjs`, `node gen-guide.mjs` (les polices viennent de `mobile/node_modules`, lance d'abord `npm install` dans `mobile/`). La vidéo transparente (ProRes, lourde) n'est pas versionnée : `gen-video.mjs` la recrée.
