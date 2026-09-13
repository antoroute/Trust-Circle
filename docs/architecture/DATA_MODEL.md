# Modèle de données

Statut : baseline V2 versionnée et contraintes cibles
Dernière mise à jour : 2026-09-13

## Modèle observé

Le plan `infrastructure/postgres/sqitch.plan` est la source de vérité. Il
reconstruit la baseline V2 historique puis les cinq changements de TC-104 à
TC-106. Son état final définit :

- `users` : compte, e-mail, hash de mot de passe, nom ;
- `device_bootstrap_grants`, `account_devices`, `device_registration_challenges`, `device_approval_challenges` : autorisation de réauthentification hachée, identité Ed25519 de compte/appareil, état de confiance, preuves de possession et décisions signées à usage unique ;
- `groups`, `user_groups` : cercle, appartenance et rôle `admin|member` ; l'unique propriétaire reste `groups.creator_id` ;
- `join_requests`, `join_request_votes` : demandes et votes d'entrée ;
- `group_keys`, `group_device_keys`, `group_device_key_history` : mécanisme historique de cercle, clés publiques courantes signées et versions immuables remplacées ;
- `conversations`, `conversation_users` : conversation et participants ;
- `messages` : enveloppe E2EE V2 et clés de message enveloppées ;
- `refresh_tokens` : sessions renouvelables ;
- `notifications` : événements applicatifs utilisateur.

`TC-201` a repris l'état antérieur comme `v2_baseline`, puis les cinq évolutions
dans Sqitch avec scripts transactionnels `deploy`, `revert` et `verify`.
`TC-202` a supprimé le volume staging historique et l'a reconstruit depuis ce
seul plan. `init.sql` n'est plus monté ni exécuté et reste uniquement une
archive historique jusqu'à sa suppression dédiée.

La circulation de ces données par parcours est décrite dans [`FUNCTIONAL_REFERENCE.md`](FUNCTIONAL_REFERENCE.md), et les fichiers responsables dans [`TRACEABILITY.md`](TRACEABILITY.md).

## Problèmes structurels à résoudre

- Le staging possède désormais son registre Sqitch ; toute autre base
  persistante devra être créée ou adoptée par une procédure explicitement
  contrôlée.
- Le stockage des rôles est explicite, mais le transfert de propriété et l'interface complète de gestion restent à concevoir.
- Le rattachement, les preuves de possession et d'accès, l'approbation/refus/révocation, la rotation et l'historique signés sont implémentés par les lots B/C/D de `TC-106`.
- Horodatages mêlant `timestamp` et `timestamptz`.
- Énumérations métier parfois représentées par texte libre.
- Messages sans séquence serveur/cursor robuste pour la synchronisation.
- Pas d'index couvrant `messages(conversation_id, sent_at, id)` pour le
  chargement paginé ; ce point doit être mesuré avec des données synthétiques
  avant une évolution de schéma dédiée.
- Notifications JSON génériques sans classification de sensibilité/version.
- Absence de tables explicites pour vérification e-mail, récupération, suppression, signalement/blocage et journal de sécurité minimal.

## Contraintes cibles

- Toute ligne métier sensible porte un identifiant stable, des horodatages UTC et, si nécessaire, une version optimiste.
- L'identité de l'auteur est écrite depuis le principal authentifié côté serveur.
- Appartenance et écriture associée sont vérifiées dans la même transaction ou protégées par une contrainte équivalente.
- Les identifiants de message fournis par le client sont uniques par domaine défini et rendent l'envoi idempotent.
- Une séquence serveur monotone par conversation ou un curseur opaque stable permet la reprise.
- Une clé révoquée ne peut plus être sélectionnée comme destinataire de nouveaux messages.
- Une version historique ne peut plus signer ni recevoir un nouveau message,
  mais reste disponible pour vérifier/déchiffrer l'historique qui la référence.
- Les refresh tokens sont hachés, rotatifs, liés à une session/appareil et révoquables ; leur type diffère cryptographiquement/logiquement des access tokens.
- Les suppressions et rétentions sont documentées dans `docs/compliance/DATA_MAP.md`.

## Règles de migration

1. Une migration est immuable après déploiement.
2. Chaque évolution fournit une stratégie `expand/migrate/contract` si deux versions applicatives peuvent coexister.
3. Les migrations destructrices exigent sauvegarde, test de restauration et approbation humaine.
4. La compatibilité avec les enveloppes cryptographiques historiques est explicitement testée.
5. Une migration ne journalise aucune donnée de message, clé ou jeton.
6. Chaque changement Sqitch possède un déploiement, une réversion et une
   vérification ; les bases persistantes privilégient un correctif compatible
   vers l'avant plutôt qu'une réversion destructive.

Le choix Sqitch 1.6.1 et ses limites sont consignés dans
[`ADR-0006`](../adr/ADR-0006-migrations-postgresql.md).
