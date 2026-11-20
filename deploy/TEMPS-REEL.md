# Passer en temps réel, pas à pas

L'appli et le moteur n'ont plus aucune donnée de démonstration : tout vient d'Île-de-France Mobilités (PRIM).
Ce guide explique ce qu'il faut activer, comment vérifier que chaque source répond, et ce que veut dire chaque erreur.
Pour chaque commande, il est indiqué où la lancer.

---

## Étape 1 : activer les bonnes API sur ton compte PRIM

Sur prim.iledefrance-mobilites.fr, connecté à ton compte :
1. Ouvre le catalogue des API et **abonne-toi** à ces trois API (même clé pour les trois) :
   - **Prochains Passages (plateforme Île-de-France Mobilités) – requête unitaire** : les horaires en direct des arrêts.
   - **Calculateur Île-de-France Mobilités – accès générique (Navitia)** : la recherche d'adresses, les arrêts proches et les itinéraires.
   - **Messages Info Trafic** : les perturbations de toutes les lignes.
2. Dans « Ma consommation », regarde le **quota de chaque API**. Les prochains passages ont un quota d'environ 1 000 000 requêtes par jour ; vérifie celui du calculateur et de l'info trafic sur ta page, ils sont différents.
3. Dans « Mes alertes », crée une alerte à 80 % de chaque quota : tu recevras un e-mail avant d'être bloqué.

Les jeux de données (référentiel des lignes, sorties des gares) sont publics : rien à activer. Le jeton « Jeux de données » reste facultatif.

---

## Étape 2 : lancer le moteur avec ta clé (sur ta machine locale)

```bash
cd ~/Pilepoli-app-trafic/engine
npm install
nano .env            # PRIM_API_KEY=ta-clé   (la ligne DATA_MODE n'existe plus, tu peux l'effacer)
npm run dev
```
Au démarrage, tu dois lire :
- `Moteur Pilepoil 0.3.0 prêt … (données : PRIM, temps réel)`
- `Référentiel des lignes chargé : XXXX lignes` (quelques milliers). S'il dit « indisponible », les lignes s'affichent sans leurs couleurs officielles : voir l'étape 4.

Sans clé, le moteur s'arrête aussitôt : c'est voulu, il ne sert jamais de données inventées.

---

## Étape 3 : vérifier chaque source, une par une (sur ta machine locale, dans un 2e terminal)

| Ce qu'on vérifie | Commande | Ce que tu dois voir |
|---|---|---|
| Le moteur | `curl -s localhost:8787/health` | `"prim":{"up":true…}` et `"lines":` supérieur à 0 |
| Recherche d'adresse | `curl -s "localhost:8787/places?q=chatelet"` | une liste de lieux (Châtelet, Châtelet-Les Halles…) |
| Prochains passages | `curl -s "localhost:8787/stops/STIF:StopArea:SP:71410:/departures"` | des départs avec `"reliability":"direct"` pour beaucoup |
| Arrêts proches | `curl -s "localhost:8787/nearby?lon=2.3553&lat=48.8809"` | 5 stations autour de Gare du Nord, avec `lat`/`lon` et des départs |
| Itinéraire | `curl -s "localhost:8787/journeys?from=2.3553;48.8809&to=2.2380;48.8919"` | des trajets avec `legs`, chaque tronçon avec un `path` (tracé) |
| Info trafic | `curl -s localhost:8787/traffic` | `"lines":[…]` sans `"error"` |
| Sorties d'une gare | `curl -s localhost:8787/stops/71410/exits` | une liste de sorties (peut être vide pour certaines gares) |

Ajoute `| head -c 600` à la fin d'une commande pour n'afficher que le début de la réponse.

---

## Étape 4 : que faire si une source ne répond pas

- **`/traffic` répond `"error":"abonnement"`** : l'API Messages Info Trafic n'est pas activée pour ta clé (étape 1). Relance le moteur après l'abonnement.
- **Une route répond `"error":"quota"`** : le quota du jour est atteint. Il revient le lendemain. Si ça arrive souvent, demande une hausse de quota au support PRIM (formulaire de contact), en expliquant le nombre d'utilisateurs.
- **`Source PRIM indisponible`** : PRIM ne répond pas ou a refusé la requête. Regarde la ligne d'erreur dans le terminal du moteur : `401`/`403` = clé ou abonnement, `404` = identifiant inconnu, `500` = panne côté PRIM.
- **Référentiel des lignes « indisponible »** : teste l'accès au portail depuis la machine du moteur :
  `curl -sI https://data.iledefrance-mobilites.fr/api/explore/v2.1/catalog/datasets/referentiel-des-lignes/exports/json | head -1`
  Un `200` veut dire que ça marche (relance le moteur). Sinon, envoie-moi la réponse : l'adresse du jeu de données a peut-être changé.
- **`/stops/…/exits` toujours vide** : envoie-moi la réponse de
  `curl -s "https://data.iledefrance-mobilites.fr/api/explore/v2.1/catalog/datasets/acces/records?limit=1"`
  pour que j'ajuste la lecture des colonnes.

---

## Étape 5 : tester l'appli sur ton téléphone avec les vraies données (sur ta machine locale)

```bash
cd ~/Pilepoli-app-trafic/mobile
npm install
npx expo start --tunnel --clear
```
`EXPO_PUBLIC_ENGINE_URL` dans `mobile/.env` doit pointer vers ton moteur (adresse du tunnel cloudflared, ou plus tard `https://api.pilepoil.fr`).

Ce qui change par rapport à avant :
- Plus de trajet de démo ni de bouton « faire avancer le trajet » : le guidage suit l'heure réelle.
- Sans position, l'accueil te propose d'ouvrir les réglages au lieu d'afficher un arrêt inventé.
- Si le moteur ou PRIM ne répond pas, l'appli le dit (hors connexion, source indisponible, quota) et garde ton trajet en cours.

---

## Étape 6 : mettre le moteur en ligne

Suis `deploy/LISEZ-MOI.md`, partie 1 (VPS, Docker, Nginx, HTTPS). Puis vérifie depuis ta machine locale :
`curl -s https://api.pilepoil.fr/health`

---

## Étape 7 : build de test, vraies captures, publication

1. Build preview (sur ta machine locale, dans `mobile/`) : `npx eas-cli@latest build --profile preview --platform ios`.
2. Fais un vrai trajet de bout en bout, téléphone verrouillé : tu dois recevoir les rappels.
3. Prends les **captures d'écran pour les stores pendant ce trajet** (accueil avec le trafic, choix du trajet, guidage avec la carte, arrivée avec les sorties). Les visuels du kit de marque (`brand/kit/`) servent pour la bannière Google Play et les réseaux sociaux.
4. Publication : `deploy/LISEZ-MOI.md`, partie 2.

---

## Limites des données réelles, à connaître

- **Toutes les lignes n'ont pas de temps réel.** Certaines lignes de bus n'envoient que l'horaire prévu : l'appli affiche alors « Horaire prévu », jamais « En direct ».
- **Gares SNCF (RER, Transilien)** : les prochains passages sont donnés pour la gare entière, pas par quai.
- **Pas de position des trains** : IDFM ne publie pas la position des véhicules. La carte place ton point grâce au GPS du téléphone, ou d'après les horaires quand le GPS ne capte pas (souterrain) ; c'est toujours écrit à l'écran.
- **Messages de perturbation en français** : ils viennent des transporteurs. En anglais, l'appli le signale.
- **Prédictions** : elles apparaissent après quelques jours de moteur allumé (8 passages observés par ligne, arrêt et heure).
- **Sorties de gare** : leur précision dépend des données d'IDFM ; certaines gares n'ont pas de numéro de sortie.
