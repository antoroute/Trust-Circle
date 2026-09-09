# TC-109 — Retirer le faux secret de l'application publique

Statut : En cours — implémentation locale validée, staging à valider
Priorité : P0 architecture de sécurité
Dépendances : TC-101, TC-102 et TC-108 terminées

## Problème

Flutter embarque une valeur `APP_SECRET`, avec un fallback historique en clair,
et l'envoie dans `X-App-Secret` pour Auth, Messaging et Socket.IO. Toute valeur
distribuée dans une application Android, iOS, Windows ou macOS peut être
extraite puis rejouée. Le backend présente pourtant ce header comme un filtre
d'accès, ce qui crée une barrière illusoire et un secret opérationnel inutile.

## Objectifs

- Retirer la valeur, le fallback, le header et la dépendance de configuration
  de tous les clients et services.
- Ne pas remplacer ce secret public par une autre constante extractible.
- Conserver les vraies protections : TLS, JWT typés, preuve Ed25519 d'appareil,
  ACL, validation stricte, CORS et quotas.
- Vérifier explicitement les routes publiques inscription/connexion/refresh et
  le handshake Socket.IO après retrait.
- Nettoyer staging, tests, documentation et affirmations historiques sans
  modifier la production.

## Décisions de principe

- L'attestation de plateforme n'est pas une authentification universelle et
  n'est pas introduite dans ce lot. Elle pourra renforcer certains signaux
  anti-abus plus tard sans devenir obligatoire pour l'accès au contenu.
- Inscription et connexion sont volontairement des endpoints publics protégés
  par limites, réponses sobres et future vérification d'e-mail (`TC-401`).
- Une route Messaging métier exige toujours access token strict et preuve
  d'appareil active ; le handshake Socket.IO impose le même couple.
- `X-Client-Version` reste une information publique de compatibilité, pas un
  secret ni une preuve d'origine.

## Lots pressentis

### A — Backend et contrats

- Supprimer `APP_SECRET` des configurations Auth/Messaging.
- Retirer les middlewares HTTP et le contrôle du handshake Socket.IO.
- Retirer `X-App-Secret` des allowlists CORS et des smokes.
- Tester que l'absence du header n'affaiblit ni JWT, ni preuve d'appareil, ni
  ACL et que les valeurs historiques n'accordent aucun privilège.

### B — Client Flutter

- Retirer la constante, le fallback et tous les headers HTTP/WebSocket.
- Supprimer `flutter_dotenv`, le chargement `.env` et l'asset s'ils n'ont aucun
  autre consommateur.
- Exécuter analyse, tests et builds/probes disponibles sans introduire d'écran
  ou d'attente supplémentaire.

### C — Staging et documentation

- Retirer `TC_APP_SECRET` du générateur, template et Compose staging.
- Déployer sans migration de base, conserver release/configuration de rollback
  et prouver les parcours sans header.
- Mettre à jour fonctionnement, configuration, invariants, traçabilité,
  inventaire staging et documentation historique annotée.

## Acceptation

- [ ] Aucune valeur ou référence `APP_SECRET`/`X-App-Secret` ne subsiste dans
      le code distribué, le backend actif ou le staging déclaratif.
- [ ] Inscription, connexion et refresh fonctionnent sans header caché.
- [ ] Une route Messaging sans access token ou preuve active reste refusée.
- [ ] Socket.IO accepte un appareil actif sans header secret et refuse token,
      preuve ou appareil invalides.
- [ ] CORS, quotas et limites de taille de `TC-107`/`TC-108` restent actifs.
- [ ] Aucun aller-retour, délai ou geste utilisateur supplémentaire n'est créé.
- [ ] Tests locaux, smoke staging, santé, logs et rollback sont documentés.

## Hors périmètre

- Attestation Play Integrity, App Attest/DeviceCheck ou équivalent Windows.
- Vérification d'e-mail, CAPTCHA et anti-abus avancé (`TC-401`).
- TLS/domaine staging (`TC-113`).
- Mise à jour générale des dépendances (`TC-110`).
