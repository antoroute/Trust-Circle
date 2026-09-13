# TC-202 — Réinitialiser le schéma staging et adopter Sqitch

Statut : Terminée
Priorité : P0 exploitation et intégrité des données
Décision : propriétaire — aucune donnée staging à conserver
Dépendance : TC-201

## Contexte et décision

Le volume PostgreSQL de `trust-circle-staging` précède l'adoption de Sqitch et
a été construit par `init.sql` puis cinq migrations manuelles. Le propriétaire
a confirmé le 2026-09-13 qu'aucun compte, cercle, conversation, message ou état
d'appareil ne doit être conservé : toutes les données sont synthétiques et le
staging peut repartir de zéro.

TC-202 est donc une réinitialisation contrôlée du seul volume PostgreSQL du
staging, pas une migration de données ni une adoption artificielle de
l'historique sur une base existante.

## Objectif mesurable

Recréer `trust-circle-staging-postgres-data` depuis une base vide exclusivement
avec Sqitch 1.6.1, démarrer les backends seulement après la réussite des six
changements et démontrer le fonctionnement complet du staging.

## Périmètre

- stack Docker Compose `trust-circle-staging` sur LXC106 ;
- volume nommé `trust-circle-staging-postgres-data` uniquement ;
- job Sqitch ponctuel, immuable et sans port publié ;
- conservation des secrets et de la configuration réseau existants ;
- validation SQL, healthchecks, smoke fonctionnel et inventaire assaini.

## Hors périmètre

- production et autres stacks du LXC106 ;
- conservation ou transformation des données synthétiques existantes ;
- séparation des rôles PostgreSQL (`TC-203`) ;
- pipeline général de promotion/rollback (`TC-210`).

## Critères d'acceptation

- [x] La cible, le projet, le volume et leur usage exclusif sont revérifiés.
- [x] L'ancien amorçage `init.sql` est retiré du Compose staging.
- [x] L'image Sqitch 1.6.1 est imposée par digest et s'exécute non-root.
- [x] Auth et Messaging attendent la réussite du job de migration.
- [x] Le seul volume PostgreSQL staging est supprimé puis recréé.
- [x] Une base vide reçoit exactement les six changements Sqitch et 17 tables
  publiques, sans donnée métier avant le smoke test.
- [x] Les quatre services sont sains et le smoke adversarial complet réussit.
- [x] Un second `compose up` rejoue un déploiement Sqitch sans effet et reste
  sain.
- [x] Aucun secret n'est affiché, régénéré ou ajouté au dépôt.
- [x] L'inventaire, la procédure de déploiement et la traçabilité sont à jour.

## Risques et retour arrière

La suppression du volume efface définitivement les données synthétiques. Cette
perte est explicitement acceptée. Avant suppression, vérifier que le volume
n'est monté que par PostgreSQL de ce projet et conserver l'ancienne release et
une copie privée du fichier de configuration. En cas d'échec, recréer un volume
vide avec l'ancienne release ; aucune restauration métier n'est requise.

Le changement ne modifie ni le bind `10.0.20.20:18081`, ni les règles NPM et
OPNsense, ni les secrets JWT/PostgreSQL existants.

## Validations prévues

1. validation statique Compose et shell ;
2. précontrôle Docker et SQL assaini ;
3. arrêt du seul projet, suppression explicite du seul volume puis déploiement ;
4. catalogue Sqitch, schéma et absence initiale de données métier ;
5. healthchecks et smoke test complet ;
6. second déploiement sans effet et contrôle des journaux ;
7. mise à jour de la documentation et livraison Git.

## Résultat et preuves

- release déployée : `bb4ce6da93839d9db253e3505d41060023416006` ;
- cible préalablement vérifiée : l'unique consommateur du volume était le
  service PostgreSQL du projet `trust-circle-staging` ;
- ancien volume supprimé et volume de même nom recréé vide ; les 57 comptes,
  16 conversations et 26 messages synthétiques ont été abandonnés comme
  autorisé ;
- état avant smoke : 17 tables publiques, 6 changements Sqitch et zéro ligne
  dans `users`, `groups`, `conversations` et `messages` ;
- job `migrate` : code `0`, utilisateur `sqitch` UID 1024, rootfs en lecture
  seule, `cap_drop=ALL`, réseau interne `trust-circle-staging-data` uniquement ;
- `sqitch check`, les six scripts `verify` et les assertions de catalogue ont
  réussi ;
- smoke TC-111 complet réussi avec l'état synthétique attendu de 3 comptes,
  1 cercle, 1 conversation et 2 messages, puis suppression de toutes ses
  fixtures ; l'état final contient zéro ligne dans les 17 tables publiques ;
- deux nouveaux lancements du job ont répondu `Nothing to deploy
  (up-to-date)` ;
- PostgreSQL, Auth, Messaging et Gateway sont sains, à zéro redémarrage et au
  bon label de révision ; zéro log Auth/Messaging de niveau 50/60 observé ;
- chemin NPM `10.0.10.20 -> 10.0.20.20:18081` : HTTP 200 ; le bind Docker reste
  limité à `10.0.20.20:18081` ;
- secrets JWT et PostgreSQL conservés sans affichage ; copie privée de la
  configuration précédente : `staging.env.before-bb4ce6da9383`, mode `0600`.

## Validations non exécutées

- Aucune restauration des anciennes données : elles étaient synthétiques et
  leur abandon a été explicitement décidé.
- Aucun changement ni test de production : aucune cible de production n'était
  autorisée ou nécessaire pour cette tâche.

## Risques résiduels

- Le même compte PostgreSQL réalise actuellement DDL et requêtes applicatives ;
  sa séparation appartient à `TC-203`.
- Le job Sqitch est intégré au staging, mais la procédure générale de promotion,
  sauvegarde et rollback restera à éprouver en `TC-210` après les autres travaux
  d'exploitation de la phase 2.

## Prochaine tâche

`TC-203` — séparer les comptes PostgreSQL, les secrets et les privilèges par
service.
