# Déploiement

Statut : garde-fous définis, baseline Sqitch validée, intégration staging à faire
Dernière mise à jour : 2026-09-13

## Préconditions

- Cible et environnement confirmés.
- Commit/tag et digests immuables identifiés.
- CI verte, revue terminée, contrat et migrations validés en staging.
- Sauvegarde récente et restauration testée selon la classe de changement.
- Plan de rollback écrit et fenêtre/observabilité disponibles.
- Autorisation humaine explicite pour la production.

## Séquence cible

1. Capturer l'état avant déploiement sans secret : versions, santé, schéma, espace disque et dernière sauvegarde vérifiée.
2. Exécuter un job Sqitch unique : `check`, puis `deploy --verify`, avec le rôle
   DDL et l'image approuvée par digest.
3. Déployer les images par digest, avec healthchecks et limites de ressources.
4. Exécuter les smoke tests : authentification, renouvellement, liste de cercles, synchronisation et temps réel avec comptes de test dédiés.
5. Observer erreurs, latence, saturation et files pendant la fenêtre définie.
6. Enregistrer le résultat et clôturer ou déclencher le rollback.

## Rollback

Un rollback applicatif ne doit pas écrire sur un schéma devenu incompatible. Employer les migrations `expand/migrate/contract` pour permettre la coexistence. La restauration complète de base est un dernier recours avec perte potentielle depuis le point de sauvegarde ; son autorisation et son impact doivent être explicites.

Un script Sqitch `revert` est une capacité de test et de secours, pas une
autorisation d'annulation automatique. Sur une base persistante, générer et
relire la séquence, analyser l'impact sur les données et disposer d'une
sauvegarde restaurable avant approbation. Une migration corrective compatible
vers l'avant est préférée lorsque des données ont déjà été écrites.

## Interdictions

- Déployer `latest` sans digest vérifié.
- Modifier manuellement une table ou un secret pour contourner une migration.
- Reconstruire une image directement sur la VM.
- Publier des variables, logs bruts ou sorties contenant des secrets dans une conversation d'assistance.
- Déployer simultanément code, protocole crypto et migration destructive sans stratégie de compatibilité.

## À documenter par TC-002/TC-004

Noms réels des stacks et services, domaines assainis, réseau/proxy, registre d'images, emplacement des volumes, healthchecks, mécanisme de secrets, chemin de promotion et commandes exactes. Le document public ne contiendra aucune valeur sensible.

## Implémentation staging actuelle

- Projet : `trust-circle-staging`.
- Source : `deploy/staging/compose.yml` et `deploy/staging/README.md`.
- Releases immuables sous `/opt/trust-circle-staging/releases/<commit>`.
- Secrets persistants hors release sous `/opt/trust-circle-staging/shared/staging.env`.
- Gateway loopback seulement ; aucun déploiement production automatisé.
- Inventaire et preuves : `docs/operations/STAGING_INVENTORY.md`.

## Gestion du schéma

- Outil : Sqitch 1.6.1, décision dans `ADR-0006`.
- Source : `infrastructure/postgres/sqitch.plan` et répertoires
  `deploy/`, `revert/`, `verify/`.
- Registre : schéma PostgreSQL `trust_circle_sqitch`.
- Secrets : URI et mot de passe injectés uniquement à l'exécution.
- Concurrence : un seul job est orchestré ; le verrou PostgreSQL de Sqitch
  protège aussi contre un second lancement accidentel.
- Transition : la base existante n'est pas encore enregistrée. `TC-202` doit
  comparer et réconcilier son catalogue avant adoption ; le déploiement naïf de
  la baseline sur une base non vide est interdit.
- Test jetable : `bash infrastructure/postgres/test-migrations.sh` depuis la
  racine du dépôt ou `bash test-migrations.sh` depuis son répertoire.
