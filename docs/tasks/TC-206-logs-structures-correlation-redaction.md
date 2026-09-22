# TC-206 — Logs structurés, corrélation et redaction

Statut : Terminée le 2026-09-22
Priorité : P0 sécurité et exploitation
Décision : mainteneur
Dépendances : TC-112, TC-204, TC-205

## Contexte et problème

Fastify produit du JSON mais journalise actuellement l'URL complète, des
adresses réseau et des erreurs brutes. Messaging ajoute des identifiants de
comptes, groupes, conversations, messages et sockets, tandis que la présence
utilise des `console.*` non structurés. Les identifiants Fastify locaux ne
permettent pas non plus de suivre une requête entre la gateway et un backend.

Cette situation risque de copier des secrets ou le graphe social dans
journald/Loki et produit plusieurs lignes inutiles sur les chemins temps réel.

## Objectif mesurable

Établir un contrat de journalisation JSON minimal, corrélé de la gateway au
backend, qui ne conserve ni contenu, secret, identifiant métier, URL brute,
adresse réseau ou objet d'erreur, tout en réduisant la volumétrie et sans
ajouter d'aller-retour réseau ou SQL.

## Périmètre

- Auth, Messaging, Socket.IO et service de présence ;
- gateway Nginx du staging et configuration du niveau de logs ;
- erreurs de démarrage et erreurs inattendues HTTP/Socket.IO ;
- tests de non-divulgation et preuves dans journald staging ;
- politique d'exploitation et inventaire staging.

## Hors périmètre

- métriques, dashboards et alertes, traités par `TC-207` ;
- rétention effective journald/Loki du homelab, à vérifier avec `TC-208` ;
- journal d'audit métier ou de transparence cryptographique ;
- production et données personnelles réelles.

## Critères d'acceptation

- [x] Chaque ligne applicative est un JSON structuré avec service,
  environnement, version de schéma et événement stable.
- [x] La gateway remplace tout identifiant client par un identifiant aléatoire
  et le propage au backend et dans la réponse.
- [x] Un backend n'accepte qu'un identifiant de corrélation strictement valide
  et en génère un nouveau dans les autres cas.
- [x] Les logs HTTP n'enregistrent jamais URL/query brute, IP, headers, corps,
  token, preuve, clé, ciphertext ou identifiant métier.
- [x] Les erreurs enregistrées et les réponses `5xx` sont assainies ; une panne
  PostgreSQL n'est pas présentée comme un simple échec d'identifiants.
- [x] Socket.IO possède un identifiant de connexion serveur, capture tous les
  rejets asynchrones et ne journalise ni payload ni graphe social.
- [x] Les `console.*` runtime sont supprimés et les healthchecks ne produisent
  pas de logs HTTP de cycle normal.
- [x] `LOG_LEVEL` est validé et vaut explicitement `info` en staging.
- [x] Les tests de sentinelles, suites backend, audits npm, smoke staging et
  inspection journald réussissent sans donnée métier résiduelle.
- [x] Politique, inventaire, traçabilité, index et roadmap sont cohérents.

## Plan de validation

1. Capturer le flux Pino en test et injecter des sentinelles dans URL, headers,
   corps et erreurs synthétiques ; vérifier leur absence sur le texte brut.
2. Tester génération, remplacement et propagation des identifiants ainsi que
   la réponse générique aux erreurs inattendues.
3. Simuler des rejets Socket.IO et vérifier une réponse générique unique sans
   promesse rejetée.
4. Exécuter build, suites et audits npm des deux services, puis les gardes
   statiques contre `console.*` et les champs interdits.
5. Déployer le commit exact sur LXC106, exécuter le smoke adversarial, nettoyer
   ses fixtures et contrôler services, labels, schéma et journaux.

## Preuves locales du 2026-09-22

- installation reproductible `npm ci`, builds et suites réussis : Auth
  `38/38`, Messaging `103/103` ;
- audits npm avec et sans dépendances de développement : zéro avis dans les
  deux services ;
- tests de sentinelles, URL/query, erreurs PostgreSQL synthétiques, corrélation,
  réponse `5xx`, Socket.IO et garde `console.*` réussis ;
- benchmark de 20 000 écritures vers `/dev/null` : moyenne de `0,002955 ms`
  par appel Auth et `0,002973 ms` par appel Messaging ;
- le remplacement des chemins de redaction récursifs Messaging par des chemins
  explicites a réduit son coût mesuré de `0,081677 ms` à moins de `0,003 ms` par
  appel, sans retirer les serializers en liste blanche ni les sentinelles.

## Preuves staging et NPM du 2026-09-22

- release finale `ebdf1c6f0f11ab615fe22ed4cff9df5dafca5f86` déployée
  depuis Git sur LXC106, labels concordants, quatre services sains sans
  redémarrage et jobs bootstrap/migration en code `0` ;
- volume PostgreSQL conservé avec sa date de création du 2026-09-14, sept
  changements Sqitch et zéro ligne dans les 17 tables publiques après le
  nettoyage des fixtures synthétiques ;
- configuration PostgreSQL effective : statements désactivés, paramètres non
  journalisés, erreurs de statement à partir de `panic`, messages serveur à
  partir de `fatal` et verbosité `terse` ;
- smoke adversarial complet réussi, puis sonde dédiée réussie sur Auth,
  Messaging, Gateway et PostgreSQL : aucune sentinelle, remplacement de
  l'identifiant client et corrélation réponse/gateway/backend ;
- une connexion Socket.IO réelle possède le même `requestId` dans le journal
  sûr de la gateway et dans l'événement `socket_connected` Messaging ;
- le premier probe a révélé le journal `combined` hérité de l'image Nginx ; le
  format JSON a été déplacé au niveau `server`, ce qui remplace cet héritage,
  puis la sonde a été rejouée avec succès ;
- NPM hôte 85 a été sauvegardé puis limité : `access_log off`, error log vers
  `/dev/null`, sinks renforcés par `systemd-tmpfiles`, HTTPS `/healthz` en
  `200`, aucune sentinelle dans NPM ni dans les quatre composants staging ;
- les rotations NPM historiques n'ont pas été supprimées : elles sont passées
  en mode `0600` et leur rétention sera traitée par `TC-208`.

## Risques, performance et rollback

Une redaction par motifs récursifs ou un excès de lignes pénaliserait le chemin
critique. L'implémentation utilise des serializers en liste blanche, des chemins
de redaction explicites et une seule ligne de fin par requête ; aucune requête
réseau/SQL n'est ajoutée. Les événements fréquents de présence et frappe ne
sont pas journalisés à succès.

Le rollback staging repointe la release TC-205
`1521faef7fb6448b23d03168dddf5da92a304c5f`, restaure son fichier
`staging.env.before-*` et recrée les conteneurs sans supprimer le volume
PostgreSQL. La configuration NPM peut être annulée avec le mode `rollback` du
script documenté, après retrait du fichier tmpfiles et restauration des deux
fichiers de logs sauvegardés. Les sauvegardes vérifiées sont sous
`/root/homelab/sauvegardes/incidents/tc206-logging-20260922/`.

## Documentation à mettre à jour

- `docs/security/LOGGING_POLICY.md` ;
- `docs/security/NETWORK_BOUNDARY.md` ;
- `docs/operations/BACKEND_CONFIGURATION.md` ;
- `docs/operations/STAGING_INVENTORY.md` ;
- `docs/architecture/TRACEABILITY.md` ;
- index de tâches, roadmap et contexte projet.

## Décisions humaines nécessaires

Aucune pour le staging. La durée de rétention centralisée et les accès Loki de
production devront être approuvés avant publication.

## Prochaine tâche

`TC-207` — ajouter health/readiness checks et métriques minimales.
