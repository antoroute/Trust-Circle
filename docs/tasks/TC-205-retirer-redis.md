# TC-205 — Décider et retirer Redis de la topologie V1

Statut : En cours
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

- [ ] Aucun paquet, import, variable ou service Redis/Valkey n'appartient aux
  backends et au déploiement staging actifs.
- [ ] La configuration Redis obsolète et permissive est supprimée du dépôt.
- [ ] Une ADR décide explicitement d'un replica Messaging sans Redis pour la
  V1 et interdit un deuxième replica sans chantier distribué complet.
- [ ] Les limites de présence, rooms, quotas et disponibilité sont documentées
  honnêtement.
- [ ] Les mesures et critères qui déclencheront un prototype distribué sont
  rattachés à `TC-207`, `TC-505`, `TC-806` et à une nouvelle ADR.
- [ ] Les exigences de réseau privé, ACL, secret, chiffrement de transport,
  observabilité, panne et rollback d'un futur bus sont documentées.
- [ ] Les tests Auth/Messaging et le smoke staging passent sans Redis ; le
  staging reste vide, sain et sur un seul replica Messaging.
- [ ] Inventaire, traçabilité, index de tâches et roadmap sont cohérents.

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
documentation ambiguë. Les recherches, tests et le smoke doivent le détecter.
Le staging n'utilisant déjà pas Redis, aucun volume ni donnée métier ne sera
supprimé. Le rollback applicatif repointe la release `TC-204` ; réintroduire
l'ancien fichier permissif n'est jamais un rollback acceptable.

## Documentation à mettre à jour

- `docs/adr/ADR-0007-topologie-temps-reel.md` ;
- `docs/architecture/REALTIME_SCALING.md` ;
- `docs/architecture/SYSTEM.md` et `docs/architecture/TRACEABILITY.md` ;
- `docs/operations/STAGING_INVENTORY.md` ;
- `docs/PROJECT_CONTEXT.md`, index de tâches et roadmap.

## Prochaine tâche

`TC-206` — ajouter des logs structurés, une corrélation et une redaction sûre.
