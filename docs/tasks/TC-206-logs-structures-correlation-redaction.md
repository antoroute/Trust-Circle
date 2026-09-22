# TC-206 — Logs structurés, corrélation et redaction

Statut : Implémentation validée localement — validation staging en attente
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

- [ ] Chaque ligne applicative est un JSON structuré avec service,
  environnement, version de schéma et événement stable.
- [ ] La gateway remplace tout identifiant client par un identifiant aléatoire
  et le propage au backend et dans la réponse.
- [ ] Un backend n'accepte qu'un identifiant de corrélation strictement valide
  et en génère un nouveau dans les autres cas.
- [ ] Les logs HTTP n'enregistrent jamais URL/query brute, IP, headers, corps,
  token, preuve, clé, ciphertext ou identifiant métier.
- [ ] Les erreurs enregistrées et les réponses `5xx` sont assainies ; une panne
  PostgreSQL n'est pas présentée comme un simple échec d'identifiants.
- [ ] Socket.IO possède un identifiant de connexion serveur, capture tous les
  rejets asynchrones et ne journalise ni payload ni graphe social.
- [ ] Les `console.*` runtime sont supprimés et les healthchecks ne produisent
  pas de logs HTTP de cycle normal.
- [ ] `LOG_LEVEL` est validé et vaut explicitement `info` en staging.
- [ ] Les tests de sentinelles, suites backend, audits npm, smoke staging et
  inspection journald réussissent sans donnée métier résiduelle.
- [ ] Politique, inventaire, traçabilité, index et roadmap sont cohérents.

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

Les preuves Compose, Nginx, PostgreSQL, journald, smoke et nettoyage restent à
ajouter après déploiement du commit exact sur LXC106.

## Risques, performance et rollback

Une redaction par motifs récursifs ou un excès de lignes pénaliserait le chemin
critique. L'implémentation utilise des serializers en liste blanche, des chemins
de redaction explicites et une seule ligne de fin par requête ; aucune requête
réseau/SQL n'est ajoutée. Les événements fréquents de présence et frappe ne
sont pas journalisés à succès.

Le rollback staging repointe la release TC-205 et recrée les conteneurs sans
supprimer le volume PostgreSQL. Les formats de logs ne sont pas contractuels
pour les clients applicatifs ; `X-Request-ID` est purement diagnostique.

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
