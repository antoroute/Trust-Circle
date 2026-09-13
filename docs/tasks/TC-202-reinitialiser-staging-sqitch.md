# TC-202 — Réinitialiser le schéma staging et adopter Sqitch

Statut : En cours
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

- [ ] La cible, le projet, le volume et leur usage exclusif sont revérifiés.
- [ ] L'ancien amorçage `init.sql` est retiré du Compose staging.
- [ ] L'image Sqitch 1.6.1 est imposée par digest et s'exécute non-root.
- [ ] Auth et Messaging attendent la réussite du job de migration.
- [ ] Le seul volume PostgreSQL staging est supprimé puis recréé.
- [ ] Une base vide reçoit exactement les six changements Sqitch et 17 tables
  publiques, sans donnée métier avant le smoke test.
- [ ] Les quatre services sont sains et le smoke adversarial complet réussit.
- [ ] Un second `compose up` rejoue un déploiement Sqitch sans effet et reste
  sain.
- [ ] Aucun secret n'est affiché, régénéré ou ajouté au dépôt.
- [ ] L'inventaire, la procédure de déploiement et la traçabilité sont à jour.

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

## Prochaine tâche

`TC-203` — séparer les comptes PostgreSQL, les secrets et les privilèges par
service.
