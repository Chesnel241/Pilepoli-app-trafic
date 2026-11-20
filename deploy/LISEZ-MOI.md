# Mise en production de Pilepoil

Deux morceaux : le **moteur** (sur ton VPS, en HTTPS) et l'**appli** (construite par EAS, envoyée aux stores).
Pour chaque commande, il est indiqué où la lancer.

---

## 1. Le moteur sur le VPS

### Ce qu'il faut avant
- Un sous-domaine qui pointe vers le VPS, par exemple `api.pilepoil.fr` (enregistrement DNS de type A vers l'IP du VPS).
- Docker et Docker Compose, Nginx et certbot sur le VPS (déjà en place sur ton Netcup).

### Installer (sur le serveur distant)
```bash
cd /opt
git clone https://github.com/Chesnel241/Pilepoli-app-trafic.git pilepoil
cd pilepoil/engine
cp .env.example .env
nano .env
```
Dans `.env`, remplis au minimum :
```
PRIM_API_KEY=ta-clé-prim
PRIM_DATASET_TOKEN=ton-jeton-jeux-de-données   (facultatif)
ACCESS_TOKEN=une-longue-chaîne-au-hasard       (facultatif, voir plus bas)
```
Puis protège le fichier : `chmod 600 .env`.

Lance le moteur :
```bash
cd /opt/pilepoil/deploy
docker compose up -d --build
docker compose logs -f engine
```
Tu dois voir `Moteur Pilepoil 0.3.0 prêt` et `données : PRIM`. Test local : `curl http://127.0.0.1:8787/health`.

### Nginx et HTTPS (sur le serveur distant)
```bash
sudo cp /opt/pilepoil/deploy/nginx-pilepoil.conf /etc/nginx/sites-available/pilepoil
sudo nano /etc/nginx/sites-available/pilepoil      # remplace api.pilepoil.fr si besoin
sudo ln -s /etc/nginx/sites-available/pilepoil /etc/nginx/sites-enabled/
```
Le fichier pointe vers des certificats qui n'existent pas encore. Pour le premier passage : commente les deux lignes `ssl_certificate` et le bloc `listen 443`, puis :
```bash
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d api.pilepoil.fr
```
Décommente ensuite, puis `sudo nginx -t && sudo systemctl reload nginx`.
Test depuis ta machine locale : `curl https://api.pilepoil.fr/health`.

### Journaux : 14 jours maximum (sur le serveur distant)
Créer `/etc/logrotate.d/pilepoil` :
```
/var/log/nginx/pilepoil.access.log {
    daily
    rotate 14
    missingok
    compress
    notifempty
    sharedscripts
    postrotate
        [ -s /run/nginx.pid ] && kill -USR1 `cat /run/nginx.pid`
    endscript
}
```
C'est ce que promet la politique de confidentialité : ne change pas l'un sans l'autre.

### Pare-feu (sur le serveur distant)
Le moteur n'écoute que sur `127.0.0.1` : seul Nginx est exposé.
```bash
sudo ufw allow 80,443/tcp
sudo ufw status
```

### Mettre à jour (sur le serveur distant)
```bash
cd /opt/pilepoil && git pull
cd deploy && docker compose up -d --build
```
Les prédictions apprises sont dans le volume Docker `pilepoil-data` : elles survivent aux mises à jour.
Sauvegarde : `docker run --rm -v deploy_pilepoil-data:/d -v /root/backups:/b alpine tar czf /b/pilepoil-data.tgz -C /d .`
(le nom exact du volume s'affiche avec `docker volume ls`).

### Ce que fait la sécurité, en clair
- **Clé PRIM** : uniquement dans `engine/.env` sur le serveur, jamais dans l'appli ni dans le dépôt.
- **Conteneur** : utilisateur non root, système de fichiers en lecture seule, aucun privilège Linux, mémoire limitée.
- **Débit** : deux limites, Nginx (5 requêtes/s par IP) et le moteur (120/min par IP). Au-delà : réponse 429.
- **Entrées** : identifiants d'arrêt, coordonnées et recherches vérifiés et bornés ; seul GET est accepté.
- **Quota PRIM** : caches partagés (passages 20 s, trajets 30 s, recherches 10 min, arrêts proches 5 min, trafic 1 min).
- **ACCESS_TOKEN** (facultatif) : l'appli l'envoie dans un en-tête. Ce n'est pas un vrai secret (il est dans l'appli), mais il écarte les robots qui viendraient vider ton quota. Mets la même valeur dans `EXPO_PUBLIC_ENGINE_KEY` côté appli.
- **Vie privée** : position arrondie à ~100 m pour les arrêts proches, IP tronquée dans les journaux, aucune donnée voyageur stockée.

---

## 2. L'appli sur les stores

### Comptes (à faire une seule fois)
- **Expo** : tu en as déjà un.
- **Apple Developer Program** : abonnement annuel payant, sur developer.apple.com (vérifie le tarif actuel). Nécessaire pour TestFlight et l'App Store.
- **Google Play Console** : frais d'inscription uniques, sur play.google.com/console.

### Préparer (sur ta machine locale, dans `mobile/`)
```bash
npx eas-cli@latest login
npx eas-cli@latest init          # relie le projet à ton compte Expo
```
Si tu utilises la clé anti-abus, ajoute-la comme variable EAS (elle ne va pas dans le dépôt) :
```bash
npx eas-cli@latest env:create --name EXPO_PUBLIC_ENGINE_KEY --value "la-même-que-ACCESS_TOKEN" --environment production --environment preview --visibility plaintext
```
Vérifie dans `eas.json` que `EXPO_PUBLIC_ENGINE_URL` est bien l'adresse de ton moteur.

### Tester sur ton téléphone avant les stores (sur ta machine locale, dans `mobile/`)
```bash
npx eas-cli@latest build --profile preview --platform ios       # ou android
```
EAS te guide pour les certificats Apple (laisse-le les gérer). Le lien d'installation arrive à la fin.
C'est la vraie appli : notifications, voix et position marchent comme en production, sans données simulées.

### Publier (sur ta machine locale, dans `mobile/`)
```bash
npx eas-cli@latest build --profile production --platform all
npx eas-cli@latest submit --platform ios
npx eas-cli@latest submit --platform android
```

### Fiche store : ce qu'il faut déclarer
- **Lien de confidentialité** : publie `PRIVACY.md` (par exemple sur `pilepoil.fr/confidentialite`), après avoir complété les crochets.
- **Apple, « Confidentialité de l'app »** : Localisation (précise et approximative), utilisée pour les fonctionnalités de l'app, **non liée** à l'identité, **pas** de suivi. Rien d'autre n'est collecté.
- **Google, « Sécurité des données »** : Position approximative et précise, traitée de façon éphémère, non partagée, pour les fonctionnalités de l'app. Données chiffrées en transit (HTTPS).
- **Catégorie** : Navigation (ou Voyages).
- **Captures** : prends-les sur le build preview.

### Avant d'appuyer sur « Envoyer »
- [ ] Crochets complétés dans `PRIVACY.md` et dans l'écran Confidentialité (`mobile/src/app/confidentialite.tsx`).
- [ ] `https://api.pilepoil.fr/health` répond `"mode":"prim"`.
- [ ] Un trajet réel fait de bout en bout avec le build preview (notifications reçues écran verrouillé).
- [ ] Test en mode avion pendant un trajet : le guidage continue sur les horaires prévus.
- [ ] Test en « Très grand » texte et en anglais.
