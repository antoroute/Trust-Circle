# TC-201 — Choisir l'outil de migration et créer une baseline PostgreSQL

Statut : Terminée
Priorité : P0 exploitation et intégrité des données
Décision : mainteneur
Dépendances : TC-002, TC-004

## Contexte et problème

Le script `infrastructure/postgres/init.sql` décrit l'état final courant alors
que cinq couples de migrations conservent les évolutions de TC-104 à TC-106.
Les exécuter successivement recréerait des objets déjà présents. Aucun outil ne
maintient aujourd'hui de registre, de verrou, de contrôle de divergence ou de
preuve sémantique de l'état obtenu.

## Objectif mesurable

Adopter un outil libre et maintenu, reconstruire une base PostgreSQL 16 vide
depuis un plan versionné et démontrer automatiquement la montée, la
vérification, la réversion complète et le redéploiement sans divergence.

## Périmètre

- décision et configuration de l'outil de migration ;
- baseline V2 historique ;
- reprise des cinq changements SQL existants ;
- scripts `deploy`, `revert` et `verify` ;
- preuve sur une base PostgreSQL 16 jetable et isolée ;
- documentation du passage de relais à TC-202.

## Hors périmètre

- enregistrer ou modifier le schéma staging/production existant ;
- séparer les comptes et privilèges PostgreSQL (`TC-203`) ;
- intégrer le job dans la stack de déploiement (`TC-210`) ;
- corriger les types, contraintes et index métier historiques ;
- supprimer `init.sql` avant la réconciliation.

## Critères d'acceptation

- [x] L'outil, sa version, sa licence, ses alternatives et ses limites sont
  enregistrés dans une ADR acceptée.
- [x] La source de vérité comporte une baseline historique puis les cinq
  changements existants dans leur ordre et avec leurs dépendances.
- [x] Chaque changement fournit `deploy`, `revert` et `verify`.
- [x] Une base PostgreSQL 16 vide atteint le schéma final attendu : 17 tables
  publiques, `pgcrypto`, contraintes et index critiques.
- [x] Un second déploiement est sans effet et `sqitch check` ne signale aucune
  divergence.
- [x] Deux exécutions concurrentes ne corrompent ni le schéma ni le registre.
- [x] Une réversion complète sur base jetable, puis un redéploiement complet,
  réussissent et repassent toutes les vérifications.
- [x] Aucune URI de connexion, aucun mot de passe ou autre secret n'est
  versionné ou affiché ; l'URI publique du projet dans le plan ne contient
  aucun identifiant de connexion.
- [x] La procédure d'adoption d'une base existante est reportée explicitement à
  TC-202 et interdit le rejeu aveugle de la baseline.

## Tests et preuves attendues

- contrôle statique du plan et des trois scripts de chaque changement ;
- `sqitch deploy --verify`, `sqitch check`, `sqitch status` et `sqitch verify` ;
- requêtes de catalogue sur tables, colonnes, contraintes, index et extension ;
- lancement concurrent de deux déploiements sur une base jetable ;
- `sqitch revert --to @ROOT`, puis redéploiement et vérification ;
- builds/tests/audits Auth et Messaging, car la baseline doit satisfaire les
  requêtes des deux services.

## Risques, migration et rollback

Les scripts descendants peuvent supprimer les rôles, appareils, grants,
challenges, approbations, messages et historiques de clés. Le descendant `005`
peut également réactiver du matériel `legacy`. Leur présence ne constitue pas
une autorisation de les exécuter sur une base persistante. Un garde SQL les
bloque hors base jetable sans activation opérateur explicite. Sur
staging/production, une migration corrective vers l'avant est préférée ; toute
réversion exige une sauvegarde restaurable, une analyse des données et une
approbation humaine.

La base existante ne possède pas encore le registre Sqitch. TC-202 devra
comparer le catalogue réel à la baseline, corriger les écarts et seulement
ensuite adopter le plan avec la procédure contrôlée de Sqitch.

## Documentation à mettre à jour

- `docs/adr/ADR-0006-migrations-postgresql.md`
- `docs/architecture/DATA_MODEL.md`
- `docs/operations/DEPLOYMENT.md`
- `docs/roadmap/ROADMAP.md`
- `docs/architecture/TRACEABILITY.md`

## Décisions humaines nécessaires

Aucune pour la création et les tests isolés. Toute adoption sur staging ou
production appartient à TC-202 et nécessite une revue distincte.

## Résultat

Sqitch 1.6.1 est adopté par `ADR-0006`. Le plan contient une baseline
reconstruite depuis l'état Git antérieur à TC-104, suivie des cinq évolutions
historiques dans leur ordre réel. Les anciens couples restent en archive
d'audit, mais ne sont plus exécutables par la procédure officielle.

Les images utilisées pour la preuve ont été résolues par digest :

- `sqitch/sqitch@sha256:f247ab0e0b66e9c2d09a400864f7314358893f5cf209cddcc4f213f7d5bfe4d3` ;
- `postgres@sha256:cf78e76683b9ca8c5733cbbdce6c9262b45b6767934dd0a95e671f9a0fc20685`.

## Validation exécutée

- banc Docker isolé sur LXC106, sans accès au volume staging : deux `deploy
  --verify` concurrents réussis, six changements uniques dans le registre et
  17 tables publiques finales ;
- `sqitch check` et les six scripts `verify` réussis ;
- second déploiement : `Nothing to deploy (up-to-date)` ;
- réversion complète des six changements, contrôle de zéro table publique,
  puis redéploiement, vérification et contrôle de catalogue réussis ;
- smoke réel Auth/Messaging exécuté sur le schéma Sqitch : comptes, JWT,
  appareils, ACL, rôles, clés, messages, transactions et Socket.IO ;
- nettoyage confirmé des conteneurs, images construites, réseau, volume,
  répertoire temporaire et secrets éphémères ;
- Auth : build, 27/27 tests, audit runtime et complet à zéro vulnérabilité ;
- Messaging : build, 90/90 tests, audit runtime et complet à zéro
  vulnérabilité ;
- `git diff --check` et `bash -n` exécutés avant livraison finale.

## Validations volontairement non exécutées

- Aucun changement ni enregistrement Sqitch sur le staging existant : cette
  adoption peut toucher l'historique réel et appartient à `TC-202` après
  comparaison et sauvegarde.
- Aucun test production : la production est hors périmètre et non autorisée.

## Risques résiduels

- Le contrôle SHA-1 de Sqitch détecte une divergence accidentelle ; ce n'est
  pas une preuve cryptographique de provenance. TC-209 doit figer les images,
  produire SBOM et provenance et protéger le pipeline.
- Les réversions sont destructrices si la base contient des données et peuvent
  régresser la confiance des clés ; le garde explicite réduit le risque
  d'erreur opérateur sans remplacer analyse, sauvegarde et approbation.
- Le modèle historique conserve plusieurs incohérences de types/horodatages et
  manque notamment un index de pagination des messages. Elles doivent être
  traitées par de nouvelles migrations mesurées, jamais en réécrivant la
  baseline.

## Prochaine tâche

`TC-202` — comparer la base staging existante avec le catalogue produit par
Sqitch, sauvegarder/restaurer une copie isolée, corriger les écarts puis adopter
le registre sans rejouer les six changements.
