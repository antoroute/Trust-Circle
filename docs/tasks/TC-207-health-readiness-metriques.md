# TC-207 — Health, readiness et métriques minimales

Statut : En cours
Priorité : P0 exploitation et sécurité
Décision : mainteneur
Dépendances : TC-206

## Contexte et problème

Auth et Messaging exposent actuellement un unique `/health` qui confirme
seulement que le processus Node répond. Docker et la gateway peuvent donc
présenter le staging comme sain alors que PostgreSQL est indisponible. Les
services n'exposent par ailleurs aucune mesure applicative agrégée permettant
de distinguer saturation HTTP, saturation du pool PostgreSQL ou pression sur
Socket.IO.

## Objectif mesurable

Séparer vivacité et aptitude à servir, borner la vérification PostgreSQL et
exposer à Prometheus un socle de métriques à cardinalité finie, sans donnée
personnelle, secret, identifiant métier ou contenu chiffré.

## Périmètre

- Auth et Messaging : `/live`, `/ready`, compatibilité `/health` et `/metrics` ;
- état des pools PostgreSQL et résultat des contrôles de readiness ;
- volume/durée HTTP par route modèle et classe de statut ;
- connexions, événements, durées et rooms Socket.IO sous forme agrégée ;
- métriques runtime Node fournies par une bibliothèque open source compatible ;
- healthchecks Docker, gateway, tests, staging et collecte Prometheus interne.

## Hors périmètre

- données de présence distribuées et fan-out multi-instance (`TC-510`) ;
- test de charge et définition de capacité (`TC-806`) ;
- SLO, alertes de production et astreinte complète ;
- télémétrie depuis les clients mobiles ou desktop ;
- exposition publique de `/metrics`.

## Composants pressentis

- `backend/auth` et `backend/messaging` ;
- `deploy/staging` ;
- configuration Prometheus du homelab ;
- documentation d'exploitation, de sécurité et de scalabilité temps réel.

## Critères d'acceptation

- [ ] `/live` ne vérifie que le processus et reste rapide sans PostgreSQL.
- [ ] `/ready` retourne `503` avec une réponse générique lorsque PostgreSQL ne
  répond pas dans le délai prévu, sans exposer l'erreur interne.
- [ ] `/health` conserve un contrat de compatibilité documenté.
- [ ] Docker utilise `/ready` pour Auth et Messaging ; la gateway distingue sa
  propre vivacité de la readiness des backends.
- [ ] `/metrics` n'est pas routé publiquement par Nginx/NPM et la collecte
  Prometheus est limitée au chemin réseau d'administration attendu.
- [ ] Les métriques ont des noms stables et des labels à cardinalité finie ;
  aucune URL brute, IP, identité, room, compte, conversation, message, clé,
  token, payload ou contenu ne peut devenir un label.
- [ ] Auth et Messaging exposent les métriques runtime, HTTP, readiness et pool
  PostgreSQL nécessaires à un diagnostic minimal.
- [ ] Messaging expose sous forme agrégée connexions, refus, événements,
  durées, transports et tailles de rooms Socket.IO.
- [ ] Les probes et scrapes normaux ne polluent pas les logs applicatifs.
- [ ] Builds, suites, audits npm, tests négatifs et smoke staging réussissent.
- [ ] La documentation, la traçabilité, la roadmap et le rollback sont à jour.

## Plan de validation

1. Tester les trois contrats de santé avec PostgreSQL disponible, en erreur et
   au-delà du délai, sans divulgation de la cause.
2. Vérifier le texte Prometheus et refuser toute valeur sensible ou label non
   borné par des tests sentinelles.
3. Générer des requêtes HTTP et échanges Socket.IO synthétiques, puis contrôler
   les compteurs, histogrammes et gauges attendus.
4. Exécuter `npm ci`, builds, suites et audits des deux backends, puis valider
   Compose et la configuration Nginx.
5. Déployer le commit exact sur LXC106, simuler une panne PostgreSQL réversible,
   vérifier les états Docker, exécuter le smoke et contrôler la cible
   Prometheus depuis son réseau autorisé.

## Risques, migration et rollback

Une readiness trop lente peut accumuler des connexions et une instrumentation
à labels libres peut épuiser la mémoire. Le test SQL doit donc avoir un délai
strict, les labels doivent être des listes fermées et les métriques ne doivent
pas ajouter d'accès SQL au chemin métier. La collecte reste interne.

Le rollback repointe la release staging précédente et restaure les
configurations Prometheus/réseau sauvegardées. Aucune donnée utilisateur n'est
à migrer ni à conserver à ce stade du projet.

## Documentation à mettre à jour

- `docs/operations/OBSERVABILITY.md` ;
- `docs/operations/STAGING_INVENTORY.md` ;
- `docs/security/NETWORK_BOUNDARY.md` et `LOGGING_POLICY.md` ;
- `docs/architecture/REALTIME_SCALING.md` et `TRACEABILITY.md` ;
- index de tâches, roadmap et contexte projet.

## Décisions humaines nécessaires

Aucune pour le code et le staging existant. Une exposition vers un nouveau
réseau de supervision ou des alertes de production nécessite une validation
explicite de la frontière réseau correspondante.
