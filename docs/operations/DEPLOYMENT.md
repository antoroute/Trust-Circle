# Déploiement

Statut : procédure TC-210, promotion par digest et retour arrière staging
Dernière mise à jour : 2026-10-01

## Préconditions

- Cible et environnement confirmés.
- Commit/tag et digests immuables identifiés.
- CI verte, revue terminée, contrat et migrations validés en staging.
- Sauvegarde récente et restauration testée selon la classe de changement.
- Plan de rollback écrit et fenêtre/observabilité disponibles.
- Autorisation humaine explicite pour la production.

## Séquence cible

Les images Auth/Messaging sont préparées par le workflow TC-209 décrit dans
`IMAGE_SUPPLY_CHAIN.md`. Avant promotion, vérifier le succès du run complet,
les deux digests et leur attestation avec `deploy/ci/verify-image.sh`. Conserver
les deux preuves et le manifeste dans le dossier de release. Le Compose
staging n'a plus de section `build` ; `compose-release.sh` impose la sélection
vérifiée et refuse les tags mutables, doublons et clés inattendues.

1. Capturer l'état avant déploiement sans secret : versions, santé, schéma, espace disque et dernière sauvegarde vérifiée.
2. Exécuter le bootstrap idempotent des rôles, puis un job Sqitch unique :
   `check`, puis `deploy --verify`, avec le rôle DDL et l'image approuvée par
   digest.
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

## Procédure staging TC-210

Portée : LXC106, projet `trust-circle-staging` uniquement. Une courte
indisponibilité est attendue : ce Compose mono-instance n'est pas un
déploiement sans interruption. Ne pas l'utiliser comme procédure production.

### Préparation sur le poste de contrôle

Choisir deux SHA complets relus : `DEPLOYMENT_COMMIT` contient la configuration
d'exploitation ; `IMAGE_COMMIT` désigne le run CI réussi et son manifeste
`deploy/releases/<IMAGE_COMMIT>.json`. Les arbres `backend/` et
`infrastructure/postgres/` doivent être strictement identiques entre les deux.
Git, jq, tar et gh authentifié avec prise en charge des attestations sont
nécessaires. Aucun token dans les arguments ni dans les rapports.

```bash
bash deploy/ci/prepare-staging-release.sh \
  <DEPLOYMENT_COMMIT> <IMAGE_COMMIT> /absolute/new/release-directory
```

Le script vérifie le succès du workflow `main`, la provenance OIDC, le commit
source et le workflow signataire des deux images, puis archive exclusivement
Git. Les éventuels changements non commités sont exclus. Le résultat contient
`release.env` (quatre valeurs publiques, jamais exécuté comme code) et
`release-evidence/{auth,messaging}.json`. Transférer ce résultat complet dans
un nouveau `/opt/trust-circle-staging/releases/<DEPLOYMENT_COMMIT>` ; ne jamais
écraser une release existante. Ne pas copier le fichier privé avec le code.

### Précontrôles sur LXC106

Dans une session Bash, renseigner `tc_release` avec le chemin exact préparé :

```bash
tc_release=/opt/trust-circle-staging/releases/<DEPLOYMENT_COMMIT>
tc_previous=$(readlink -f /opt/trust-circle-staging/current)
tc_private=/opt/trust-circle-staging/shared/staging.env
tc_compose=(bash "$tc_release/deploy/staging/compose-release.sh" "$tc_private")
exec 8>/run/lock/trust-circle-deploy.lock
flock -n 8
systemctl start trust-circle-backup.service
systemctl start trust-circle-restore-test.service
systemctl show trust-circle-backup.service trust-circle-restore-test.service \
  -p Result -p ExecMainStatus
"${tc_compose[@]}" config --quiet
"${tc_compose[@]}" pull auth messaging
```

Arrêter sur tout échec ; conserver l'ancien chemin, les références/images
locales et la date de création du volume. Vérifier les labels source des
images tirées. Comparer le schéma entre les releases : TC-210 ne change aucun
SQL. Pour une future migration, documenter séparément la compatibilité du
rollback avant d'exécuter la suite. Vérifier les permissions des secrets sans
les afficher et capturer leurs empreintes dans un fichier privé uniquement.

### Promotion et validation

Prendre aussi le verrou de sauvegarde **après** les deux services précédents
(ceux-ci prennent eux-mêmes ce verrou) et le garder pendant les changements
de version. Cela évite une archive mêlant révision et schéma de deux releases.
Les commandes suivantes exigent la base staging documentée :

```bash
exec 9>/run/lock/trust-circle-backup.lock
flock -n 9
"${tc_compose[@]}" run --rm --no-deps migrate \
  check db:pg://trust_circle_migrator@postgres/trust_circle_staging
"${tc_compose[@]}" up -d --no-build --pull never --wait --wait-timeout 180
"${tc_compose[@]}" run --rm --no-deps migrate \
  verify db:pg://trust_circle_migrator@postgres/trust_circle_staging
"${tc_compose[@]}" ps --all
bash "$tc_release/deploy/staging/smoke-test.sh" "$tc_private"
bash "$tc_release/deploy/staging/verify-safe-logs.sh" "$tc_private"
```

Exiger quatre services sains, bootstrap/migrate en code `0`, sept migrations
et assertions SQL de schéma/rôles réussies. Le parcours crée des comptes et
messages **synthétiques** ; il vérifie HTTP, refresh, appareils, ACL et
Socket.IO. Vérifier le même volume, les mêmes secrets, `/metrics` non public,
la collecte et les alertes. Ne pas imprimer les logs bruts.

Après succès seulement, basculer `current` par un lien temporaire neuf et un
renommage atomique (vérifier au préalable que `current.next` n'existe pas) :

```bash
test ! -e /opt/trust-circle-staging/current.next
test ! -L /opt/trust-circle-staging/current.next
ln -s "$tc_release" /opt/trust-circle-staging/current.next
mv -Tf /opt/trust-circle-staging/current.next /opt/trust-circle-staging/current
```

### Retour arrière applicatif

Ne pas lancer `down`, supprimer de volume, changer les secrets ou exécuter
`sqitch revert`. Pour une ancienne release préparée par TC-210, utiliser son
propre `compose-release.sh` avec les mêmes options `up`. Pour la release
legacy `44f99d0778a97460c0e696b2310d1fe07c69a6ca` uniquement :

```bash
docker compose --project-name trust-circle-staging --env-file "$tc_private" \
  -f "$tc_previous/deploy/staging/compose.yml" \
  up -d --no-build --pull never --wait --wait-timeout 180
bash "$tc_previous/deploy/staging/smoke-test.sh" "$tc_private"
bash "$tc_previous/deploy/staging/verify-safe-logs.sh" "$tc_private"
```

Cette exception réutilise ses images locales historiques, pas GHCR. Ne pas
les purger avant la fin de la fenêtre de rollback. Vérifier leurs image IDs,
les données écrites avant le retour arrière et l'absence de changement de
volume/secrets. Remettre atomiquement `current` sur cette ancienne release
après validation. Si migration incompatible ou validation échouée, arrêter
les promotions, conserver les preuves privées et analyser ; pas de
restauration destructive automatique.

L'exercice TC-210 revient ensuite à la nouvelle release avec les mêmes
contrôles et une seconde preuve de persistance. En fin de session, libérer
le verrou de backup, exécuter les deux services de sauvegarde/restauration,
contrôler leurs métriques et celles des backends, puis libérer le verrou de
déploiement :

```bash
flock -u 9
systemctl start trust-circle-backup.service
systemctl start trust-circle-restore-test.service
systemctl show trust-circle-backup.service trust-circle-restore-test.service \
  -p Result -p ExecMainStatus
flock -u 8
```

Le shell libère aussi les verrous à sa fermeture. Un échec ne doit jamais
laisser croire que `current` suffit à connaître l'état réel : vérifier les
conteneurs et leurs labels avant toute reprise.

## Implémentation staging actuelle

- Projet : `trust-circle-staging`.
- Source : `deploy/staging/compose.yml` et `deploy/staging/README.md`.
- Releases immuables sous `/opt/trust-circle-staging/releases/<commit>`.
- Secrets persistants hors release sous `/opt/trust-circle-staging/shared/staging.env`.
- Mots de passe PostgreSQL distincts sous le répertoire privé
  `/opt/trust-circle-staging/shared/staging.env.d` ; seules leurs références
  figurent dans `staging.env`.
- Gateway liée à `10.0.20.20:18081`, filtrée pour NPM uniquement selon
  `TC-113` ; aucun déploiement production automatisé.
- Une seule instance Messaging, sans Redis/Valkey selon `ADR-0007`. Un second
  replica exige la porte complète de `docs/architecture/REALTIME_SCALING.md`.
- Inventaire et preuves : `docs/operations/STAGING_INVENTORY.md`.

## Gestion du schéma

- Outil : Sqitch 1.6.1, décision dans `ADR-0006`.
- Source : `infrastructure/postgres/sqitch.plan` et répertoires
  `deploy/`, `revert/`, `verify/`.
- Registre : schéma PostgreSQL `trust_circle_sqitch`.
- Secrets : URI et mot de passe injectés uniquement à l'exécution.
- Identités : administrateur/bootstrap, migrateur/Sqitch, Auth et Messaging
  séparés selon `docs/security/DATABASE_ACCESS_CONTROL.md`.
- Confinement : utilisateur non-root, rootfs en lecture seule, aucune
  capability, `no-new-privileges`, tmpfs et plafonds de ressources vérifiés
  selon `docs/security/CONTAINER_HARDENING.md`.
- Concurrence : un seul job est orchestré ; le verrou PostgreSQL de Sqitch
  protège aussi contre un second lancement accidentel.
- Staging : volume recréé à vide et registre adopté par `TC-202` ; Auth et
  Messaging attendent la fin réussie du job `migrate`.
- Toute autre base persistante exige une procédure d'adoption distincte ; le
  déploiement naïf de la baseline sur une base non vide reste interdit.
- Test jetable : `bash infrastructure/postgres/test-migrations.sh` depuis la
  racine du dépôt ou `bash test-migrations.sh` depuis son répertoire.
