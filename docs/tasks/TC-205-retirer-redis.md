# TC-205 — Décider et retirer Redis de la topologie V1

Statut : Terminée
Priorité : P0 architecture et exploitation
Décision : mainteneur, avec validation du propriétaire
Dépendances : TC-002, TC-004, TC-108, TC-204

## Contexte et problème

Le projet initial prévoyait Redis pour Pub/Sub et présence, mais aucun code
actuel ne l'utilise. Le staging fonctionne sans Redis et une ancienne
configuration permissive subsiste dans le dépôt. Il faut décider si Redis est
nécessaire à la charge V1, sans confondre capacité d'une instance et relais
entre plusieurs instances.

## Objectif mesurable

Supprimer tout artefact Redis actif inutilisé, figer une topologie V1 à un seul
replica Messaging et documenter une porte de montée horizontale sûre, mesurée
et sans impact anticipé sur l'expérience utilisateur.

## Périmètre

- dépendances, imports, variables et ressources Redis/Valkey du projet ;
- topologie Socket.IO, présence et quotas actuellement en mémoire ;
- ancienne configuration `infrastructure/redis/redis.conf` ;
- décision, sécurité et déclencheurs de mise à l'échelle ;
- vérification du staging et smoke sans Redis.

## Hors périmètre

- ajout immédiat d'un bus distribué ou d'un second replica Messaging ;
- tests de charge/capacité complets, traités par `TC-806` après les métriques de
  `TC-207` ;
- reprise/offline durable, traitée par `TC-501` à `TC-508` ;
- suppression de ressources Redis appartenant aux autres stacks du LXC
  partagé ou réécriture de l'inventaire historique.

## Critères d'acceptation

- [x] Aucun paquet, import, variable ou service Redis/Valkey n'appartient aux
  backends et au déploiement staging actifs.
- [x] La configuration Redis obsolète et permissive est supprimée du dépôt.
- [x] Une ADR décide explicitement d'un replica Messaging sans Redis pour la
  V1 et interdit un deuxième replica sans chantier distribué complet.
- [x] Les limites de présence, rooms, quotas et disponibilité sont documentées
  honnêtement.
- [x] Les mesures et critères qui déclencheront un prototype distribué sont
  rattachés à `TC-207`, `TC-505`, `TC-806` et à une nouvelle ADR.
- [x] Les exigences de réseau privé, ACL, secret, chiffrement de transport,
  observabilité, panne et rollback d'un futur bus sont documentées.
- [x] Les tests Auth/Messaging et le smoke staging passent sans Redis ; le
  staging reste vide, sain et sur un seul replica Messaging.
- [x] Inventaire, traçabilité, index de tâches et roadmap sont cohérents.

## Décision et réalisation

`ADR-0007` retient un seul replica Messaging sans Redis pour la V1. Redis ne
réduit pas le coût du processus unique ; il sert au relais et aux compteurs
partagés lorsque plusieurs instances existent. Le candidat privilégié d'un
futur prototype est Socket.IO Redis Streams avec Valkey dédié, mais aucune
technologie n'est autorisée avant mesure, revue de licence et nouvelle ADR.

Le commit `1521faef7fb6448b23d03168dddf5da92a304c5f` supprime l'ancien
`redis.conf`, qui écoutait toutes les interfaces avec `protected-mode no`, et
ajoute la décision, le modèle de capacité et les garde-fous de distribution.
La revue indépendante a confirmé les affirmations Socket.IO, Redis Streams,
PostgreSQL adapter et licence Valkey à partir des sources officielles.

La revue a aussi identifié deux limites dans `presence.ts` indépendantes de
Redis : conservation des `Set` vides après déconnexion et requêtes ACL
proportionnelles aux utilisateurs déjà en ligne lors d'une connexion. Elles
sont documentées comme dette obligatoire de `TC-510`, avant instrumentation et
charge `TC-207`/`TC-806`.

## Preuves du 2026-09-15

- recherches locales : aucun paquet npm, import, variable, Dockerfile, script,
  migration ou service Compose Redis/Valkey dans les chemins runtime actifs ;
- `npm ls` : aucun `redis`, `ioredis`, adaptateur Redis ou Redis Streams dans
  Auth ou Messaging ;
- suites locales : Auth `27/27`, Messaging `90/90`, builds réussis et zéro avis
  dans les audits npm avec et sans dépendances de développement ;
- staging déployé depuis
  `1521faef7fb6448b23d03168dddf5da92a304c5f`, sans changement du volume
  PostgreSQL ni du schéma ;
- zéro service, volume ou variable Redis/Valkey rattaché au projet Compose
  `trust-circle-staging`, et exactement un conteneur Messaging ;
- les Redis d'autres stacks observés sur le LXC partagé ne sont reliés à aucun
  réseau ou label Trust Circle et n'ont pas été modifiés ;
- bootstrap et Sqitch sortis en code `0`, quatre services sains, zéro
  redémarrage et zéro 5xx Auth/Messaging dans la fenêtre de déploiement ;
- smoke adversarial réussi, assertions de schéma/rôles réussies, sept
  changements Sqitch et zéro ligne dans chacune des 17 tables publiques après
  nettoyage ;
- routes `/healthz`, `/health/auth` et `/health/messaging` en `200` depuis NPM
  sur `10.0.20.20:18081` et via HTTPS.

## Rollback disponible

La configuration antérieure est conservée en mode `0600` sous
`staging.env.before-1521faef7fb6` et la release TC-204
`079263be9dfa1304e36d9f24b526d138666a79ab` reste disponible. Le rollback
s'effectue par repointage puis recréation sans `--volumes`. Aucun rollback ne
doit réintroduire la configuration Redis permissive.

## Plan de validation

1. rechercher packages, imports, variables, Compose, conteneurs, volumes et
   membres de réseau liés à Redis/Valkey sans afficher de secret ;
2. exécuter builds, tests et audits npm des deux backends ;
3. déployer la release sans l'artefact obsolète sur le staging ;
4. exécuter le smoke adversarial, nettoyer ses fixtures et vérifier les 17
   tables publiques ;
5. vérifier une seule instance Messaging, aucune dépendance Redis du projet,
   quatre services sains, aucun redémarrage et les routes HTTPS ;
6. vérifier la documentation et l'absence de whitespace invalide.

## Risques et rollback

Le retrait peut révéler une dépendance implicite non versionnée ou laisser une
documentation ambiguë. Les recherches, tests et le smoke ont couvert ce
risque. Le staging n'utilisant déjà pas Redis, aucun volume ni donnée métier
n'a été supprimé. Le rollback applicatif repointe la release `TC-204` ;
réintroduire l'ancien fichier permissif n'est jamais un rollback acceptable.

## Documentation à mettre à jour

- `docs/adr/ADR-0007-topologie-temps-reel.md` ;
- `docs/architecture/REALTIME_SCALING.md` ;
- `docs/architecture/SYSTEM.md` et `docs/architecture/TRACEABILITY.md` ;
- `docs/operations/STAGING_INVENTORY.md` ;
- `docs/PROJECT_CONTEXT.md`, index de tâches et roadmap.

## Prochaine tâche

`TC-206` — ajouter des logs structurés, une corrélation et une redaction sûre.
