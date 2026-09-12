# TC-113 — Exposer le staging par TLS avec accès restreint

Statut : En cours — client et filtrage LXC prêts, routage OPNsense/NPM restant
Priorité : P0 exposition
Décision : propriétaire pour l'ouverture réseau, mainteneur pour le client
Dépendances : corrections P1 implémentées ; revue finale `TC-112`

## Contexte

Le gateway staging écoutait uniquement sur le loopback de LXC106. Le client
utilise désormais une configuration publique injectée au build et ne contient
plus les anciens domaines de production. Le bind interne a été ouvert après
installation d'un filtrage hôte limité à NPM ; OPNsense bloque encore le trajet
inter-VLAN tant que sa règle exacte n'est pas créée.

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
- [ ] NPM force TLS/HSTS, autorise WebSocket et applique l'ACL retenue.
- [ ] le chemin réseau NPM vers LXC106 est limité au port staging exact
  (filtre LXC actif ; règle OPNsense exacte encore absente).
- [ ] les tests HTTPS autorisés/refusés et le smoke REST/Socket.IO réussissent.
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

Sauvegardes préalables vérifiées, en mode `0600` :

- NPM LXC300 :
  `/root/backups/trust-circle-staging/20260912T154428Z/database.sqlite` et
  `nginx.tar.gz` ;
- staging LXC106 :
  `/opt/trust-circle-staging/shared/staging.env.before-e6dce1bfe392`.

## Étape réseau restante

Créer dans OPNsense une règle **TCP** strictement limitée à : source
`10.0.10.20` (NPM), destination `10.0.20.20`, port destination `18081`, avec
journalisation et placement avant le blocage inter-VLAN. Description proposée :
`REMOTE-IN-ALLOW-NPM-TO-TRUST-CIRCLE-STAGING-18081`.

Après application, vérifier depuis LXC300 que le gateway répond, puis créer le
proxy host NPM pour `trust-circle.kavalek.fr` avec le certificat wildcard
existant et l'ACL `Interne - VPN et 3 appareils Bbox`. Forcer SSL/HSTS, activer
WebSocket et conserver l'upstream HTTP interne `10.0.20.20:18081`. La tâche ne
sera terminée qu'après tests HTTPS autorisé, HTTPS refusé et Socket.IO réel.
