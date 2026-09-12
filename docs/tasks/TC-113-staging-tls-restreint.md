# TC-113 — Exposer le staging par TLS avec accès restreint

Statut : En cours — configuration client préparée, changement réseau non appliqué
Priorité : P0 exposition
Décision : propriétaire pour l'ouverture réseau, mainteneur pour le client
Dépendances : corrections P1 implémentées ; revue finale `TC-112`

## Contexte

Le gateway staging écoute uniquement sur le loopback de LXC106. Ce choix était
nécessaire pendant les corrections P0, mais empêche les validations physiques
Android et Windows de `TC-114`. Le client contient encore les anciens domaines
de production en dur, ce qui interdit de l'utiliser pour un test staging sûr.

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
- [ ] le gateway écoute sur une adresse interne joignable uniquement par NPM.
- [ ] NPM force TLS/HSTS, autorise WebSocket et applique l'ACL retenue.
- [ ] le chemin réseau NPM vers LXC106 est limité au port staging exact.
- [ ] les tests HTTPS autorisés/refusés et le smoke REST/Socket.IO réussissent.
- [ ] l'inventaire et le rollback sont documentés sans secret.

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
