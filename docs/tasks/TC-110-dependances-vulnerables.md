# TC-110 — Mettre à jour les dépendances vulnérables

Statut : En cours — inventaire terminé, mises à jour à appliquer
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

- [ ] `npm audit` et `npm audit --omit=dev` retournent zéro avis dans les deux services.
- [ ] Les lockfiles sont régénérés normalement sans `npm audit fix --force`.
- [ ] Auth `27/27` et Messaging `90/90` restent passants.
- [ ] Le smoke `TC-111` passe sur PostgreSQL staging.
- [ ] Quatre services sont sains, sans redémarrage ni erreur sévère.
- [ ] Aucun contrat JWT, ACL, preuve d'appareil, quota ou limite d'entrée n'est affaibli.
- [ ] L'inventaire Flutter obsolète est conservé comme travail futur de plateforme.

## Rollback

Conserver la release et la configuration staging pré-`TC-110`. Aucun changement
de schéma n'est prévu. En cas d'incompatibilité, repointer vers la release
`TC-111` et recréer uniquement les conteneurs du projet staging, sans volume.

## Hors périmètre

- Migration générale Flutter et changements de SDK/OS.
- Choix d'un outil de migration SQL (`TC-201`).
- Production.
