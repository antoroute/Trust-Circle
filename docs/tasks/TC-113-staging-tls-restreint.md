# TC-113 — Exposer le staging par TLS avec accès restreint

Statut : Terminée — TLS, ACL, REST et Socket.IO validés
Priorité : P0 exposition
Décision : propriétaire pour l'ouverture réseau, mainteneur pour le client
Dépendances : corrections P1 implémentées ; revue finale `TC-112`

## Contexte

Le gateway staging écoutait uniquement sur le loopback de LXC106. Le client
utilise désormais une configuration publique injectée au build et ne contient
plus les anciens domaines de production. Le bind interne a été ouvert après
installation d'un filtrage hôte limité à NPM. Deux règles OPNsense strictes et
appairées autorisent désormais le trajet à travers les politiques d'entrée
VLAN10 et de sortie VLAN20.

Le domaine provisoire décidé est exactement `trust-circle.kavalek.fr`. Il ne
doit pas devenir un accès public général : Nginx Proxy Manager termine TLS et
une ACL limite les sources aux VPN et appareils explicitement autorisés.

## Objectifs

- Injecter l'environnement et l'URL publique au build, sans `.env` ni secret.
- Faire échouer l'application si la configuration est absente ou incohérente.
- Identifier clairement tout build non production dans l'interface.
- Publier un unique endpoint HTTPS pour REST et Socket.IO via NPM.
- Conserver Auth, Messaging et PostgreSQL sans port hôte.
- Vérifier succès autorisé, refus hors ACL, TLS, WebSocket et smoke complet.

## Critères d'acceptation

- [x] `TC_ENVIRONMENT` et `TC_API_BASE_URL` sont des paramètres publics de build.
- [x] staging exige `https://trust-circle.kavalek.fr` et production le refuse.
- [x] HTTP n'est permis qu'en développement sur loopback.
- [x] le build staging porte un bandeau visible et aucune valeur secrète.
- [x] le bind Compose reste loopback par défaut et n'accepte une adresse interne
  qu'au moyen d'un paramètre staging explicite.
- [x] le gateway écoute sur une adresse interne filtrée pour NPM uniquement.
- [x] NPM force TLS/HSTS, autorise WebSocket et applique l'ACL retenue.
- [x] le chemin réseau NPM vers LXC106 est limité au port staging exact.
- [x] les tests HTTPS autorisés/refusés et le smoke REST/Socket.IO réussissent.
- [x] l'inventaire et le rollback sont documentés sans secret.

## Commande de build staging

```bash
flutter run -d <device> \
  --dart-define=TC_ENVIRONMENT=staging \
  --dart-define=TC_API_BASE_URL=https://trust-circle.kavalek.fr
```

Ces valeurs sont publiques. Aucun jeton, mot de passe ou secret serveur ne doit
être ajouté aux `dart-define`.

## Risque et rollback

Le risque principal est une exposition accidentelle du staging. Avant toute
modification, sauvegarder NPM et la configuration staging, vérifier la cible et
préparer le retrait du proxy host. Le rollback consiste à désactiver le proxy
host, remettre le bind gateway sur `127.0.0.1`, redéployer uniquement la stack
`trust-circle-staging` sans volume, puis confirmer l'absence d'écoute LAN.

La production et les anciens domaines `api.kavalek.fr`/`auth.kavalek.fr` sont
strictement hors périmètre.

## État appliqué et preuves

- release active : `e6dce1bfe3920fd91621acf0875a25e89a4d4731` ;
- gateway : `10.0.20.20:18081`, sans écoute simultanée sur l'ancien
  `127.0.0.1:18080` ;
- service `trust-circle-staging-firewall.service` activé et actif ;
- chaîne `DOCKER-USER` : seul NPM `10.0.10.20/32` et l'hôte LXC peuvent
  atteindre le port publié, toute autre source est rejetée ;
- tentative depuis un autre LXC du VLAN staging refusée et compteur de rejet
  incrémenté ;
- les quatre conteneurs sont sains, sans redémarrage ni log sévère détecté ;
- smoke REST/PostgreSQL/Socket.IO passé via l'adresse interne après le
  redéploiement.
- règles OPNsense journalisées et placées avant leurs blocages respectifs :
  `REMOTE-IN-ALLOW-NPM-TO-TRUST-CIRCLE-STAGING-18081` sur `opt1/in` et
  `EXTERNAL-OUT-ALLOW-NPM-TO-TRUST-CIRCLE-STAGING-18081` sur `opt2/out` ;
- les deux règles autorisent uniquement
  `TCP 10.0.10.20/32 → 10.0.20.20:18081` ;
- proxy NPM `85` : upstream HTTP interne, certificat wildcard `4`, ACL `1`,
  SSL forcé, HSTS, HTTP/2, WebSocket et protection des exploits actifs ;
- HTTP redirige vers HTTPS ; `/healthz`, `/health/auth` et
  `/health/messaging` répondent `200` via le domaine ;
- handshake Socket.IO `200` via le domaine ;
- LXC101 et LXC113, absents de l'ACL NPM, reçoivent `403` ; une source non NPM
  vers le port interne reste bloquée par le filtre LXC ;
- smoke adversarial `TC-111` entièrement réussi via
  `https://trust-circle.kavalek.fr`.

Sauvegardes préalables vérifiées, en mode `0600` :

- NPM LXC300 :
  `/root/backups/trust-circle-staging/20260912T154428Z/database.sqlite` et
  `nginx.tar.gz` ;
- NPM LXC300, immédiatement avant création du proxy :
  `/root/backups/trust-circle-staging/20260912T193948Z/database.sqlite` et
  `nginx.tar.gz`, intégrité SQLite et archive vérifiées ;
- staging LXC106 :
  `/opt/trust-circle-staging/shared/staging.env.before-e6dce1bfe392`.

Les sauvegardes OPNsense avant/après et les preuves de règles sont conservées
dans `/root/homelab/sauvegardes/incidents/tc113-opnsense-20260912/`. Le rapport
assaini est
`/root/homelab/documentation/cartographie/tc113-opnsense-20260912.md`.

## Particularité réseau et rollback

La politique OPNsense filtre ce flux deux fois. Modifier ou retirer l'accès
implique donc de traiter ensemble les deux règles `opt1/in` et `opt2/out` ; une
seule règle laisse le flux bloqué ou crée une politique incohérente.

Le rollback complet consiste à supprimer ou désactiver uniquement le proxy NPM
`85`, retirer ensemble les deux règles OPNsense nommées ci-dessus, remettre le
bind gateway sur `127.0.0.1:18080` et redéployer la seule stack
`trust-circle-staging` sans `--volumes`. Vérifier ensuite que NPM expire vers
`18081`, que le domaine ne publie plus le staging et que les quatre services
restent sains localement.
