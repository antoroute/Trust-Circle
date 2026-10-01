# TC-210 — Promotion, migration et rollback staging

Statut : En cours
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

- [ ] Précontrôle : cible, sauvegarde et restauration récente prouvées.
- [ ] Release préparée depuis Git, run CI réussi et attestations vérifiées.
- [ ] Compose sans build local ; images distantes imposées par digest.
- [ ] Secrets persistants distincts de la sélection publique de release.
- [ ] Sqitch check/deploy/verify réussis ; schéma et rôles conformes.
- [ ] Promotion réelle et smoke HTTP/Socket.IO/logs réussis.
- [ ] Retour à la release précédente puis nouvelle promotion prouvés.
- [ ] Même volume, mêmes secrets et persistance des données synthétiques pendant l'exercice.
- [ ] Sauvegarde/restauration après promotion réussies, observabilité saine.
- [ ] Inventaire, procédure de rollback et porte de sortie Phase 2 à jour.

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
La prochaine phase est la Phase 3 ; TC-301 reste à ouvrir explicitement.
