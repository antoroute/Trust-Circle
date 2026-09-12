# TC-110 — Mettre à jour les dépendances vulnérables

Statut : Terminée — validée localement et sur staging le 2026-09-12
Priorité : P0 chaîne logicielle
Décision : mainteneur pour les versions correctives, propriétaire si une rupture produit est nécessaire
Dépendance : TC-111 terminée

## Constat initial du 2026-09-12

`npm audit` relève 14 avis dans Auth (`2 critical`, `7 high`, `5 moderate`)
et 15 dans Messaging (`1 critical`, `7 high`, `6 moderate`, `1 low`). Les
chemins critiques passent notamment par `fast-jwt`, Fastify, `bcrypt`/`tar`,
Socket.IO/Engine.IO/`ws` et les outils `tsx`/esbuild.

L'arbre Flutter est ancien mais `pub outdated` ne constitue pas un avis de
vulnérabilité. Les montées majeures de plugins plateforme seront séparées des
correctifs backend afin de ne pas confondre sécurité et migration Android,
Windows, iOS ou macOS.

## Objectifs

- Mettre Auth et Messaging sur les versions corrigées et compatibles de
  Fastify 5 et de ses plugins officiels.
- Mettre à jour `bcrypt`, Socket.IO et les dépendances transitives signalées.
- Obtenir zéro avis `npm audit`, production et développement, sans `--force`,
  override opaque ni suppression de contrôle.
- Rejouer toutes les suites de `TC-111`, puis le smoke PostgreSQL staging.
- Documenter les dépendances Flutter obsolètes sans effectuer ici une montée
  majeure de plateforme non testable sur tous les OS.

## Lots

1. Auth : Fastify/plugins JWT-CORS-Helmet-rate-limit, bcrypt et outils.
2. Messaging : même socle, Socket.IO et outils.
3. Validation locale complète et inspection des arbres verrouillés.
4. Déploiement staging, smoke adversarial, santé, logs et rollback.

## Critères d'acceptation

- [x] `npm audit` et `npm audit --omit=dev` retournent zéro avis dans les deux services.
- [x] Les lockfiles sont régénérés normalement sans `npm audit fix --force`.
- [x] Auth `27/27` et Messaging `90/90` restent passants.
- [x] Le smoke `TC-111` passe sur PostgreSQL staging.
- [x] Quatre services sont sains, sans redémarrage ni erreur sévère.
- [x] Aucun contrat JWT, ACL, preuve d'appareil, quota ou limite d'entrée n'est affaibli.
- [x] L'inventaire Flutter obsolète est conservé comme travail futur de plateforme.

## Réalisation et preuves

Les dépendances directes de sécurité sont désormais verrouillées notamment sur
Fastify `5.12.4`, `@fastify/jwt` `10.2.2`, `pg` `8.23.0`, `bcrypt` `6.0.0`
et Socket.IO `4.8.3`. Les schémas de réponse Fastify ont été complétés pour
les statuts d'erreur déjà émis par les routes appareil et message ; aucun
contrat métier ni statut effectif n'a été modifié.

- avant correction : Auth `14` avis, Messaging `15` avis ;
- après correction : zéro avis dans les arbres complets et `--omit=dev` ;
- tests propres après `npm ci` : Auth `27/27`, Messaging `90/90` ;
- commit déployé : `68e324c71758d3843371904f0be8a8201b09a389` ;
- images : Auth `sha256:ddbe0fb13b09`, Messaging `sha256:bb8760a501f3` ;
- smoke PostgreSQL/Socket.IO `TC-111` intégral réussi ;
- quatre healthchecks sains, zéro redémarrage et zéro correspondance
  `fatal|panic|uncaught|unhandled` dans la fenêtre post-déploiement ;
- 40 sondes par service : Auth moyenne `1,679 ms`, maximum `5,020 ms` ;
  Messaging moyenne `1,536 ms`, maximum `3,448 ms`.

`flutter pub outdated` a aussi été relevé. Les montées majeures de
`flutter_secure_storage`, `local_auth` et `socket_io_client` restent affectées
aux lots plateforme, car elles exigent des builds et essais Android, Windows,
iOS et macOS ; elles ne correspondent pas à un avis de vulnérabilité démontré
par l'outil Dart actuel.

## Rollback

Conserver la release et la configuration staging pré-`TC-110`. Aucun changement
de schéma n'est prévu. En cas d'incompatibilité, repointer vers la release
`TC-111` et recréer uniquement les conteneurs du projet staging, sans volume.

La release précédente est
`1aeaccf31f13c31ad58ab9c332a5d4f0140c8b76`. La configuration précédente est
conservée en mode `0600` sous `staging.env.before-68e324c71758`. Aucune
migration SQL ni rotation de secret n'a eu lieu.

## Hors périmètre

- Migration générale Flutter et changements de SDK/OS.
- Choix d'un outil de migration SQL (`TC-201`).
- Production.
