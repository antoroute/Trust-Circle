# TC-210 — Promotion, migration et rollback staging

Statut : Terminée sur staging — 2026-10-01
Priorité : P0 exploitation
Responsable : mainteneur
Dépendances : TC-202 à TC-209

## Objectif

Promouvoir les images attestées TC-209 dans `trust-circle-staging` sur LXC106,
vérifier Sqitch, la messagerie, les logs et la reprise, puis exercer le retour
à la release précédente et remettre la nouvelle release en service.

L'autorisation utilisateur porte sur ce staging synthétique. Le volume
PostgreSQL et les secrets existants sont conservés. La production et la Phase 3
sont hors périmètre. Aucun changement de schéma métier n'est nécessaire.

## Critères d'acceptation

- [x] Précontrôle : cible, sauvegarde et restauration récente prouvées.
- [x] Release préparée depuis Git, run CI réussi et attestations vérifiées.
- [x] Compose sans build local ; images distantes imposées par digest.
- [x] Secrets persistants distincts de la sélection publique de release.
- [x] Sqitch check/deploy/verify réussis ; schéma et rôles conformes.
- [x] Promotion réelle et smoke HTTP/Socket.IO/logs réussis.
- [x] Retour à la release précédente puis nouvelle promotion prouvés.
- [x] Même volume, mêmes secrets et persistance des données synthétiques pendant l'exercice.
- [x] Sauvegarde/restauration après promotion réussies, observabilité saine.
- [x] Inventaire, procédure de rollback et porte de sortie Phase 2 à jour.

## Risques et reprise

Courte indisponibilité possible lors de la recréation des conteneurs. Garder
la release `44f99d…`, ses images locales et le fichier de secrets inchangé.
Le rollback applicatif utilise cette ancienne déclaration sans `--build`, sans
`down --volumes` et sans `sqitch revert`. Le pointeur `current` n'est changé
qu'après les contrôles de santé et le smoke. Une erreur de migration impose
une analyse de compatibilité ; aucun rollback SQL automatique n'est autorisé.

Les CVE Debian et limites du stockage de sauvegarde décrites par TC-208/209
restent des portes avant données réelles ; cette tâche n'autorise pas la bêta.

## Tests et documentation

Tester la préparation, les références invalides, la syntaxe Bash et ShellCheck,
puis l'exercice réel avec mesures de durée et preuves assainies. Mettre à jour
DEPLOYMENT, STAGING_INVENTORY, BACKUP_RESTORE, la roadmap et le contexte.
La prochaine phase est la Phase 3 ; reprendre le prototype TC-301, dont la
décision MLS/OpenMLS a déjà été prise, sans le déclarer implémenté.

## Résultat et preuves

- Release `5bd5831afc1e6ba3a0e3c24e7f5cd35513105a7d`, images source
  `f6c8fe4e43a1a149e3f54a290a02b9e418877d5a` ; références dans
  `STAGING_INVENTORY.md` et le manifeste TC-209.
- 12/12 tests Node des scripts, Bash syntaxe et ShellCheck réussis ;
  [CI de la release](https://github.com/antoroute/Trust-Circle/actions/runs/36905626936)
  entièrement verte, incluant 41 tests Auth, 105 Messaging, audits npm et
  migrations/réversion/redéploiement/permissions sur PostgreSQL jetable.
- Trois bascules réelles : services prêts en 46, 45 et 45 s ; chaque smoke
  adversarial et contrôle des logs réussit. Anciennes images exactes vérifiées
  pendant le rollback ; données comparées par empreintes des 17 tables.
- Sauvegarde et restauration isolée avant/après réussies ; neuf comptes et
  six messages synthétiques restent en staging. Secrets et volume conservés.
- HTTPS santé 200, métriques publiques 404, collecte Prometheus et reprise
  à 1, aucune alerte CircleHaven active au contrôle final.
- Preuves privées :
  `/root/homelab/sauvegardes/incidents/tc210-deployment-20261001/`.

Pas de test Flutter/appareil répété : aucun code client ni contrat API modifié.
Pas de restauration destructive de la base active, de charge représentative
ni de déploiement sans interruption prouvé. Les CVE, le stockage de backup
transitoire et le LXC partagé restent des limites avant bêta, pas des obstacles
au prototype cryptographique isolé.
