# Déploiement staging

Cette stack remplace les anciens projets génériques `app` et `infra`. Son nom Docker Compose est toujours `trust-circle-staging`.

## Propriétés

- PostgreSQL dédié et volume `trust-circle-staging-postgres-data`.
- Schéma construit exclusivement par le job ponctuel Sqitch avant le démarrage
  d'Auth et Messaging ; aucun SQL d'initialisation Docker parallèle.
- Réseaux `trust-circle-staging-edge` et `trust-circle-staging-data`.
- Réseau edge dédié et adressage statique : gateway `172.30.108.10`, Auth
  `172.30.108.11`, Messaging `172.30.108.12` dans `172.30.108.0/24`.
- Les services backend ne font confiance qu'à la gateway (`172.30.108.10/32`)
  pour les en-têtes proxy ; aucune origine navigateur n'est autorisée tant que
  le staging reste réservé aux clients natifs.
- Redis/Valkey absent : aucun code backend actuel ne l'utilise et `ADR-0007`
  impose un seul replica Messaging tant que la porte documentée dans
  `docs/architecture/REALTIME_SCALING.md` n'est pas satisfaite.
- Auth/messaging non publiés sur l'hôte.
- Gateway liée par défaut uniquement à `127.0.0.1:18080`. Une adresse interne
  différente exige `TC_STAGING_BIND_ADDRESS`, un port dédié, un filtrage réseau
  limité à NPM et la procédure `TC-113` ; ne jamais utiliser `0.0.0.0`.
- Secrets générés hors dépôt : configuration en `0600`, répertoire de mots de
  passe PostgreSQL en `0700` et quatre fichiers distincts montés en lecture
  seule. Les valeurs DB ne figurent pas dans le fichier d'environnement ni
  dans la configuration Docker inspectable des runtimes.
- Images backend GHCR attestées, sélectionnées par digest dans `release.env` ;
  aucun build sur le serveur. Le commit de déploiement peut différer du commit
  image uniquement si les arbres backend et migrations sont identiques.
- Images backend basées sur Node fixé par digest et déclarant `USER node`.
- Images PostgreSQL/Nginx fournies par digest dans le fichier d'environnement privé.
- Configuration backend validée avant écoute selon `docs/operations/BACKEND_CONFIGURATION.md` ; aucun fallback de secret ou de connexion PostgreSQL.
- Logs JSON minimaux selon `docs/security/LOGGING_POLICY.md` : corrélation
  gateway/backend, niveau `info`, aucune URL brute, IP, header, corps,
  identifiant métier ou erreur brute. PostgreSQL ne journalise ni statements
  ni paramètres, limite les messages serveur aux erreurs fatales `terse`, et
  le `error_log` Nginx non assainissable est désactivé au profit des statuts de
  l'access log sûr.
- Tous les services utilisent un rootfs en lecture seule, un utilisateur
  non-root, `no-new-privileges`, `cap_drop: ALL` et des limites de ressources.
  PostgreSQL écrit seulement dans son volume et ses deux tmpfs dédiés.
- `/live` vérifie uniquement le processus, `/ready` vérifie PostgreSQL avec un
  délai borné, et les healthchecks Docker utilisent `/ready`. `/metrics` reste
  privé au réseau Docker et n'est jamais relayé par la gateway.

## Déploiement sur LXC106

Le code source est copié dans un répertoire de release sous `/opt/trust-circle-staging/releases/<commit>`. La configuration reste dans `/opt/trust-circle-staging/shared/staging.env` et les quatre mots de passe PostgreSQL dans son répertoire frère `staging.env.d`.

La procédure de promotion et rollback, avec verrous et sauvegarde, est dans
`docs/operations/DEPLOYMENT.md`. Préparer d'abord une release avec
`deploy/ci/prepare-staging-release.sh` depuis le poste de contrôle disposant de
Git, jq et gh authentifié. Ce script archive un commit, vérifie le run CI et
les deux attestations, puis produit les références publiques `release.env`.
Transférer cette release complète, preuves comprises, vers LXC106.

Sur une **première installation seulement**, choisir les digests tiers
approuvés puis créer le fichier privé une seule fois :

```bash
bash deploy/staging/generate-env.sh \
  /opt/trust-circle-staging/shared/staging.env \
  <FULL_COMMIT> staging-<SHORT_COMMIT> \
  postgres@sha256:<DIGEST> nginx@sha256:<DIGEST> \
  sqitch/sqitch@sha256:<DIGEST>
```

Ne pas régénérer ce fichier lors d'une promotion. Ses anciens champs
`TC_GIT_COMMIT` et `TC_IMAGE_TAG` ne sélectionnent plus les images : le wrapper
impose les quatre références publiques vérifiées de `release.env`.

Depuis le répertoire de release, valider sans afficher les secrets :

```bash
bash deploy/staging/compose-release.sh \
  /opt/trust-circle-staging/shared/staging.env config --quiet
```

Après sauvegarde, précontrôles et acquisition des verrous du runbook, tirer
les deux images approuvées par digest, puis démarrer sans build ni pull
implicite. Compose attend le bootstrap réussi puis le job de migration :

```bash
bash deploy/staging/compose-release.sh \
  /opt/trust-circle-staging/shared/staging.env \
  up -d --no-build --pull never --wait --wait-timeout 180
```

Vérifier les deux jobs en code `0`, les sept changements Sqitch et le schéma
avant les smoke tests :

```bash
bash deploy/staging/compose-release.sh \
  /opt/trust-circle-staging/shared/staging.env ps --all
```

Ne pas employer `docker-entrypoint-initdb.d` ni exécuter `init.sql` : le plan
`infrastructure/postgres/sqitch.plan` est l'unique source de vérité.

Le réseau et le volume sont conservés pendant la promotion. Ne pas exécuter
`down`, supprimer le réseau ni recréer PostgreSQL à vide pour mettre à jour
les images. Les cas de changement de topologie nécessitent une procédure
distincte et approuvée.

Après les healthchecks, exécuter :

```bash
bash deploy/staging/smoke-test.sh \
  /opt/trust-circle-staging/shared/staging.env
```

Puis vérifier le contrat de logs avec des sentinelles exclusivement
synthétiques. Le script contrôle leur absence, le remplacement d'un
`X-Request-ID` client et la corrélation entre réponse, gateway et backend sans
afficher les lignes collectées :

```bash
bash deploy/staging/verify-safe-logs.sh \
  /opt/trust-circle-staging/shared/staging.env
```

Le smoke test lance aussi, dans le conteneur Messaging, le parcours réel de
confiance d'appareil : réauthentification du bootstrap, preuve Ed25519,
rejet du rejeu, second appareil `pending`, approbation/refus signés, isolation
du registre, preuve d'accès liée au token, publication et rotation signées des
clés de cercle, conservation de l'historique, refus des versions obsolètes et
course entre publication et révocation globale. Il vérifie ensuite le blocage
immédiat de l'appareil révoqué et la disponibilité des anciens messages. Il ne
journalise aucun mot de passe, token, grant ou matériel privé.

Le parcours crée et connecte ses comptes, renouvelle l'access token avec le
refresh token, puis appelle Messaging sans aucun secret d'application partagé.
Il vérifie également qu'une route Messaging reste refusée sans access token.

Depuis `TC-111`, il exerce aussi trois comptes réels et les rôles
propriétaire/administrateur/membre : accès croisés cercle, conversation,
messages et clés, preuve d'appareil altérée, appareil en attente ou révoqué,
usurpation d'expéditeur, traitement d'adhésion et élévation de rôle. Les refus
critiques sont suivis d'une lecture PostgreSQL via l'API afin de confirmer que
l'état métier est resté inchangé.

Ne jamais exécuter `docker compose config` sans `--quiet` dans une sortie partagée : la configuration résolue contient des secrets.

## Inspection sûre

```bash
bash deploy/staging/compose-release.sh \
  /opt/trust-circle-staging/shared/staging.env ps
```

Pour documenter les variables, extraire uniquement leurs noms via `docker inspect` et `jq`; ne pas copier la sortie brute. Les conteneurs Auth, Messaging et migration ne doivent exposer ni mot de passe, ni `PGPASSWORD`, ni `DATABASE_URL` dans `Config.Env`.

## Accès client

Le staging est accessible sous `https://trust-circle.kavalek.fr`, derrière
une ACL NPM restreinte aux accès autorisés. Aucun client ne doit utiliser les
domaines de production historiques.

Pour `TC-113`, le seul bind interne autorisé est `10.0.20.20:18081`. Installer
au préalable les deux fichiers de `host/` dans `/usr/local/sbin` et
`/etc/systemd/system`, puis activer le service. La chaîne `DOCKER-USER`
n'autorise sur ce port que NPM `10.0.10.20` et l'hôte Docker lui-même. Le
loopback historique `127.0.0.1:18080` n'est pas conservé simultanément.

Pour `TC-207`, installer également le script et les deux unités
`trust-circle-metrics-collector*` présents dans `host/`, puis activer le timer.
Il collecte les endpoints backend via leurs IP Docker fixes et publie les
résultats dans le collecteur textfile du `node_exporter` existant. Il ne faut
publier aucun port métrique supplémentaire. La procédure complète et le
rollback sont décrits dans `docs/operations/OBSERVABILITY.md`.

Pour `TC-208`, installer `age`, le script `trust-circle-backup`, les quatre
unités `trust-circle-{backup,restore-test}.*` et une copie privée de
`trust-circle-backup.conf.example`. La configuration doit pointer vers une
cible NFS existante et vers les assertions SQL de la release courante. Générer
l'identité `age` hors dépôt, ne laisser que son destinataire public au job de
sauvegarde et fournir l'identité au test par `LoadCredentialEncrypted`.

Après une exécution manuelle réussie des deux services, activer les timers :

```bash
systemctl enable --now trust-circle-backup.timer \
  trust-circle-restore-test.timer
systemctl start trust-circle-backup.service
systemctl start trust-circle-restore-test.service
```

Installer également `monitoring/circlehaven-alerts.yml` dans le répertoire de
règles Prometheus de VM112, valider avec `promtool` avant rechargement et
confirmer qu'aucune règle CircleHaven n'est en alerte. Le runbook complet, la
rétention et les limites de la cible staging sont dans
`docs/operations/BACKUP_RESTORE.md`.

## Destruction du staging

La suppression du volume PostgreSQL est irréversible. Elle exige une autorisation explicite distincte et une résolution exacte du projet :

```bash
bash deploy/staging/compose-release.sh \
  /opt/trust-circle-staging/shared/staging.env down
```

La commande ci-dessus conserve volontairement le volume. Ne pas ajouter `--volumes` sans décision explicite sur les données de staging.
