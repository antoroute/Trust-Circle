# Sauvegarde et restauration

Statut : implémenté et validé sur staging par `TC-208`
Dernière mise à jour : 2026-10-01

## Objectifs provisoires de bêta

- RPO : 24 heures.
- RTO : 2 heures.
- Responsable des alertes et de la reprise : propriétaire du homelab.

Ces valeurs sont des objectifs d'exploitation, pas une garantie commerciale.
Elles devront être revues après mesure d'une volumétrie et d'un taux d'écriture
réels.

## Contenu et séparation

- PostgreSQL : schéma, données, ACL d'objets et registre Sqitch dans un dump
  logique custom.
- Preuve : révision Git, version PostgreSQL et comptages de lignes agrégés sont
  placés dans l'archive chiffrée.
- Configuration déclarative : Compose, proxy, migrations, scripts et règles
  d'alertes restent versionnés dans Git.
- Secrets : mécanisme de sauvegarde séparé ; aucun secret serveur n'est ajouté
  au dump ou au dépôt.
- Clés privées E2EE clientes : jamais sauvegardées par le serveur.

Les rôles PostgreSQL sont recréés depuis la configuration déclarative et les
secrets de restauration avant `pg_restore`. Les mots de passe actifs ne sont
donc pas exportés avec la base.

## Sauvegarde automatique

`trust-circle-backup.timer` lance chaque nuit à 02:17, avec un délai aléatoire
de 15 minutes, le service `trust-circle-backup.service`. Le script :

1. résout exactement le conteneur PostgreSQL du projet
   `trust-circle-staging` ;
2. crée le dump custom et les comptages agrégés uniquement sous `/run` ;
3. valide le dump avec `pg_restore --list` ;
4. crée une archive puis la chiffre avec `age` avant toute copie NFS ;
5. copie le ciphertext et sa somme SHA-256 de façon atomique ;
6. vérifie la copie puis applique la rétention ;
7. publie uniquement succès, date, durée et taille dans le textfile collector.

La rétention GFS conserve 7 jours, 5 semaines et 12 mois. Une rotation ne se
produit qu'après la réussite et la vérification du nouvel artefact.

La destination staging actuelle est un sous-répertoire `circlehaven-staging`
du montage TrueNAS existant sous `/mnt/truenas/immich/library/backups`. Elle est
hors du disque du LXC et ne contient que des fichiers `.age` et `.sha256` en
mode `0600`. Elle est transitoire : une bêta avec données persistantes exige un
dataset/export TrueNAS dédié, ses propres ACL et des snapshots distincts.

## Gestion de la clé

Le job quotidien possède seulement le destinataire public dans
`/etc/trust-circle-backup/recipient.txt`. Le test de restauration reçoit
l'identité privée par `LoadCredentialEncrypted`; elle n'est jamais placée dans
une variable d'environnement ou dans Git.

Une copie de récupération hors LXC est conservée en mode `0600` dans le coffre
de secrets du homelab. Sa valeur ne doit jamais être affichée, copiée dans un
rapport ou transmise à un assistant. La perte de cette identité rend les
sauvegardes irrécupérables ; son exposition rend leur chiffrement inutile.

Le credential systemd repose sur la clé machine d'un stockage hôte non chiffré.
Il réduit les expositions accidentelles, mais ne protège pas contre une
compromission root du LXC ou un accès physique complet au serveur.

## Test de restauration automatique

`trust-circle-restore-test.timer` s'exécute chaque dimanche à 04:17, avec un
délai aléatoire de 20 minutes. Il :

1. choisit le backup chiffré le plus récent et vérifie son checksum ;
2. le déchiffre exclusivement sous `/run` ;
3. refuse toute archive contenant un chemin inattendu ;
4. démarre la même image PostgreSQL sur un `tmpfs`, dans un réseau Docker
   `--internal`, sans port publié ;
5. restaure avec des rôles et secrets synthétiques ;
6. vérifie les 17 tables, les sept changements Sqitch, `pgcrypto`, les index et
   contraintes critiques, les propriétaires et privilèges, les clés étrangères
   validées et les comptages agrégés ;
7. démarre temporairement les images Auth et Messaging et exige `/ready=200` ;
8. supprime conteneurs, réseau, secrets synthétiques et plaintext, même en cas
   d'échec.

Lancer manuellement les deux contrôles sans afficher leur environnement :

```bash
systemctl start trust-circle-backup.service
systemctl show trust-circle-backup.service -p Result -p ExecMainStatus

systemctl start trust-circle-restore-test.service
systemctl show trust-circle-restore-test.service -p Result -p ExecMainStatus
```

Ne jamais exécuter directement le script de restauration avec une identité
privée passée sur la ligne de commande.

## Articulation avec les déploiements

Depuis `TC-210`, `DEPLOYMENT.md` impose un test de sauvegarde/restauration
avant puis après la promotion. Pendant le changement de conteneurs et de
pointeur `current`, l'opérateur conserve le même verrou
`/run/lock/trust-circle-backup.lock` que les jobs de reprise ; aucun dump ne
doit associer le schéma d'une release au label d'une autre. Ne jamais démarrer
les services de backup/restauration en gardant ce verrou : le libérer d'abord.

Les assertions suivent `/opt/trust-circle-staging/current`, basculé seulement
après les contrôles de santé et les tests fonctionnels. Un rollback applicatif
compatible ne restaure pas un ancien dump : il conserve le volume actif et
les données écrites depuis la promotion. La restauration demeure un exercice
isolé, pas un écrasement du staging.

## Métriques et alertes

Le `node_exporter` de LXC106 expose :

```promql
circlehaven_backup_last_run_success
circlehaven_backup_last_success_timestamp_seconds
circlehaven_backup_duration_seconds
circlehaven_backup_size_bytes
circlehaven_restore_test_last_run_success
circlehaven_restore_test_last_success_timestamp_seconds
circlehaven_restore_test_duration_seconds
```

VM112 charge six règles versionnées dans
`deploy/staging/monitoring/circlehaven-alerts.yml` : collecte métrique absente,
readiness répétée, sauvegarde en échec ou vieille de plus de 36 heures, et test
de restauration en échec ou vieux de plus de huit jours. Alertmanager utilise
le relais mail existant. Les expressions sont validées par `promtool`, dont des
cas synthétiques d'échec, sans déclencher de fausse notification réelle.

## Dernière preuve

Le 2026-09-29 sur le staging vide :

- sauvegarde chiffrée : succès, 92 376 octets, environ 1 seconde ;
- checksum du ciphertext : succès après copie NFS ;
- restauration isolée depuis cet artefact : succès en environ 5 secondes ;
- schéma, rôles, contraintes, Sqitch et comptages : conformes ;
- Auth et Messaging : readiness `200` sur la base restaurée ;
- ressources temporaires et plaintext : absents après le test ;
- métriques présentes dans Prometheus et six règles chargées sans alerte active.

Ces durées ne préjugent pas d'une base remplie. Elles doivent être remesurées
avec une volumétrie représentative avant la bêta.

Les exécutions automatiques des 30 septembre et 1er octobre 2026 ont ensuite
réussi. Trois générations quotidiennes étaient présentes, leurs checksums
étaient tous valides et la dernière sauvegarde a duré environ deux secondes.
La restauration a également été rejouée après ajout des contrôles stricts de
taille, de référence du checksum et de type des entrées d'archive.

## Reprise après sinistre

1. Confirmer la cible et empêcher tout client, mail ou push d'atteindre
   l'environnement de restauration.
2. Restaurer la révision déclarative enregistrée dans l'archive.
3. Installer la version PostgreSQL compatible et recréer les rôles avec de
   nouveaux secrets.
4. Vérifier le checksum, déchiffrer sous `tmpfs`, puis restaurer dans une base
   vide explicitement nommée.
5. Exécuter les assertions de schéma/rôles et comparer les comptages agrégés.
6. Démarrer les services sans exposition, vérifier leur readiness puis réaliser
   un smoke test synthétique.
7. Mesurer l'écart au point de restauration et faire approuver séparément toute
   bascule vers la production.

La restauration par-dessus une base active est interdite par ce runbook.

## Limites et rollback

- TrueNAS et le LXC résident encore dans le même serveur physique. La copie
  externe mensuelle du homelab reste manuelle : une perte globale avant cette
  copie peut donc détruire source et sauvegardes.
- La cible NFS transitoire partage actuellement l'identité d'écriture Immich ;
  le chiffrement empêche la lecture, mais pas la suppression. Dataset dédié,
  snapshots et droits séparés restent une porte obligatoire avant données
  réelles.

Pour désactiver l'automatisation sans supprimer les artefacts :

```bash
systemctl disable --now trust-circle-backup.timer \
  trust-circle-restore-test.timer
```

Retirer ensuite les unités, le script et les fichiers `.prom`, puis exécuter
`systemctl daemon-reload`. Les sauvegardes chiffrées ne sont jamais supprimées
dans un rollback technique.

## Décision historique

`TC-003` avait été clôturée par abandon explicite des données historiques, pas
par une restauration. `TC-208` apporte la première preuve réelle sur le nouveau
staging, toujours composé uniquement de données synthétiques.
