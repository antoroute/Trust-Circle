# TC-109 — Retirer le faux secret de l'application publique

Statut : Terminée — client, backend et staging validés le 2026-09-09
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

- [x] Aucune valeur ou référence `APP_SECRET`/`X-App-Secret` ne subsiste dans
      le code distribué, le backend actif ou le staging déclaratif.
- [x] Inscription, connexion et refresh fonctionnent sans header caché.
- [x] Une route Messaging sans access token ou preuve active reste refusée.
- [x] Socket.IO accepte un appareil actif sans header secret et refuse token,
      preuve ou appareil invalides.
- [x] CORS, quotas et limites de taille de `TC-107`/`TC-108` restent actifs.
- [x] Aucun aller-retour, délai ou geste utilisateur supplémentaire n'est créé.
- [x] Tests locaux, smoke staging, santé, logs et rollback sont documentés.

## Réalisation

- Auth et Messaging n'attendent plus de variable, middleware ou header secret
  partagé ; le CORS ne l'annonce plus et Socket.IO conserve access JWT plus
  preuve Ed25519 d'un appareil actif.
- Flutter ne charge plus `.env`, ne distribue plus `flutter_dotenv` et ne pose
  plus ce header sur HTTP ou Socket.IO. Les headers publics sont centralisés.
- Compose, son générateur et son template n'injectent plus le secret. La ligne
  historique a été retirée du fichier privé actif sans afficher sa valeur.
- Le smoke persistant couvre désormais inscription, connexion, refresh,
  refus Messaging sans access token et parcours Socket.IO authentifié sans
  secret partagé.

## Preuves

- Commits : implémentation `19aa30d0d0873705579c1e7fb8ca9b841015dee8`,
  smoke final `a55d8c5ecda649bb29096ea0f4301ad7bd14e888`.
- Local : Auth `27/27`, Messaging `90/90`, Flutter `39/39` ; analyse Flutter
  sans erreur ni avertissement bloquant (85 informations historiques).
- Staging : quatre services sains, zéro redémarrage, aucun événement
  `error|fatal|panic` sur la fenêtre post-déploiement et smoke complet réussi.
- Quarante sondes via la gateway : Auth moyenne `1,110 ms`, maximum
  `1,713 ms` ; Messaging moyenne `1,110 ms`, maximum `1,619 ms`.
- Les noms de variables des conteneurs confirment l'absence du secret : Auth
  conserve ses clés access/refresh serveur ; Messaging ne reçoit que la clé
  publique access.

## Rollback

La release complète pré-`TC-109`
`054eabdf65624d4c5db654742ba7ddf77e88a4cc` est conservée. La configuration
privée antérieure au retrait est sauvegardée en mode `0600` sous
`staging.env.before-19aa30d0d087`; l'instantané suivant, déjà nettoyé, est
`staging.env.before-a55d8c5ecda6`. Aucune migration ou modification de schéma
n'a été réalisée.

## Hors périmètre

- Attestation Play Integrity, App Attest/DeviceCheck ou équivalent Windows.
- Vérification d'e-mail, CAPTCHA et anti-abus avancé (`TC-401`).
- TLS/domaine staging (`TC-113`).
- Mise à jour générale des dépendances (`TC-110`).
