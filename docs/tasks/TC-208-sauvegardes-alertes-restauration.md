# TC-208 — Automatiser sauvegardes, alertes et tests de restauration

Statut : Terminée sur staging
Priorité : P0
Responsable : propriétaire de l'infrastructure
Dépendances : TC-003, TC-201, TC-207

## Objectif

Transformer la politique théorique de reprise en capacité réellement opérable :
produire chaque nuit une sauvegarde PostgreSQL cohérente et chiffrée hors du
LXC, surveiller sa fraîcheur et son résultat, puis restaurer périodiquement
l'artefact chiffré dans une cible sans réseau externe.

## Décisions provisoires pour la bêta

- RPO cible : 24 heures au maximum après une exécution nominale.
- RTO cible : 2 heures pour restaurer PostgreSQL et redémarrer les services à
  partir des artefacts et secrets nécessaires.
- Sauvegarde logique PostgreSQL au format custom, emballée avec les comptages
  agrégés et la révision applicative, puis chiffrée avec `age`.
- Fréquence : chaque nuit à 02:17, avec délai aléatoire de 15 minutes.
- Rétention GFS : 7 jours, 5 semaines et 12 mois.
- Test de restauration : chaque dimanche à 04:17, avec délai aléatoire de
  20 minutes.
- Responsable des alertes et de la reprise : propriétaire du homelab.
- Les secrets serveur restent gérés séparément ; ils ne sont ni ajoutés au
  dump, ni copiés dans Git.

Ces objectifs sont adaptés à une bêta privée. Ils devront être revus à partir
de la volumétrie, du taux d'écriture et des attentes réelles avant une
publication publique.

## Conception de sécurité

1. Le dump en clair n'existe que sous `/run`, donc en mémoire volatile.
2. `pg_restore --list` valide le format avant chiffrement.
3. Le fichier `age` est copié atomiquement sur une cible NFS hors LXC ; une
   somme SHA-256 du ciphertext est vérifiée après copie.
4. La clé publique suffit au job quotidien. La clé privée de récupération
   n'est fournie qu'au service de restauration sous forme de credential
   systemd chiffré et possède une copie de secours hors LXC.
5. La restauration emploie le même digest PostgreSQL que le staging, un volume
   `tmpfs`, un réseau Docker `--internal` et aucun port publié.
6. Les rôles, le schéma, les contraintes, le registre Sqitch et les comptages
   agrégés sont vérifiés avant de lancer Auth et Messaging avec des secrets
   exclusivement synthétiques.
7. Tous les conteneurs et fichiers en clair du test sont supprimés par un trap,
   y compris en cas d'erreur.
8. Les métriques ne contiennent ni nom de fichier, ni compte, ni donnée
   métier : seulement succès, date, durée et taille agrégée.

## Livrables

- `deploy/staging/host/trust-circle-backup` ;
- services et timers systemd de sauvegarde et de restauration ;
- configuration non secrète d'exemple ;
- test automatisé de la politique de rétention ;
- règles Prometheus et alerte Alertmanager ;
- runbook `docs/operations/BACKUP_RESTORE.md` ;
- rapport assaini de la dernière restauration de preuve.

## Critères d'acceptation

- [x] Un backup daté, chiffré et vérifié est stocké hors du LXC106.
- [x] Aucun secret ou contenu métier n'apparaît dans Git, les métriques ou le
  rapport.
- [x] La restauration utilise réellement l'artefact chiffré le plus récent.
- [x] La cible de restauration est isolée, éphémère et ne publie aucun port.
- [x] Schéma, contraintes, registre Sqitch, rôles et comptages agrégés sont
  vérifiés.
- [x] Auth et Messaging atteignent leur readiness sur la base restaurée.
- [x] Durées de sauvegarde et restauration, taille et point de reprise sont
  mesurés sans divulguer de données.
- [x] Rétention, rotation, RPO/RTO provisoires et responsable sont documentés.
- [x] Prometheus reçoit les métriques et les règles d'échec/fraîcheur sont
  validées.
- [x] Le timer quotidien et le timer hebdomadaire sont actifs.
- [x] La copie de récupération de la clé privée existe hors du LXC et reste en
  mode `0600`.

## Validation du 2026-09-29

- `age` 1.1.1 Debian, licence BSD-3-Clause ;
- `bash -n`, ShellCheck 0.9.0 et test de rétention : réussis ;
- sauvegarde réelle : 92 376 octets, environ 1 seconde, checksum vérifié sur
  la cible NFS ;
- restauration réelle depuis le ciphertext : environ 5 secondes ;
- 17 tables, sept changements Sqitch, extension, index, contraintes,
  propriétaires, privilèges, clés étrangères et comptages conformes ;
- Auth et Messaging prêts sur la base restaurée avec secrets synthétiques ;
- aucun conteneur, réseau, plaintext ou secret synthétique persistant ;
- deux timers actifs, métriques ingérées sur VM112 ;
- six règles Prometheus chargées, syntaxe et scénarios `promtool` réussis,
  aucune alerte CircleHaven active après validation ;
- quatre conteneurs du staging toujours sains, avec zéro redémarrage.

Suivi du 2026-10-01 : les deux premières exécutions nocturnes automatiques ont
réussi, les trois générations présentes passent leur checksum, et la preuve de
restauration a été rejouée après durcissement du parsing des checksums et des
archives. Aucun redémarrage applicatif ni ressource temporaire n'a été observé.

## Risques et limites

- Un dump logique consomme CPU et I/O ; le timer est lancé en priorité basse et
  devra être déplacé si les mesures de charge montrent une gêne.
- La clé de restauration accessible à systemd protège contre la lecture du
  stockage NFS, pas contre une compromission root complète du LXC.
- La preuve staging peut utiliser un emplacement NFS déjà disponible. Avant
  toute bêta contenant des données à conserver, une cible TrueNAS dédiée avec
  ACL et snapshots propres doit remplacer cet emplacement transitoire.
- La copie hors LXC protège d'une perte du disque du conteneur, mais une copie
  externe au serveur physique reste requise contre la perte globale du
  homelab.

## Rollback

Désactiver les deux timers, supprimer leurs unités, le script et les métriques,
puis recharger systemd. Cette opération ne touche ni PostgreSQL actif, ni son
volume. Les sauvegardes chiffrées restent conservées jusqu'à une décision
explicite ; leur suppression n'est jamais incluse dans le rollback technique.
