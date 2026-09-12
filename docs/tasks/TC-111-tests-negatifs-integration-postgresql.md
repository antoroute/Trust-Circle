# TC-111 — Tests négatifs et intégration PostgreSQL

Statut : Terminée — suites locales et PostgreSQL staging validés le 2026-09-12
Priorité : P0 filet de sécurité
Décision : mainteneur pour l'implémentation, propriétaire pour tout changement de contrat
Dépendances : TC-004, TC-102 à TC-109 terminées

## Contexte

Les suites Auth et Messaging couvrent déjà de nombreux contrats avec des
doubles de base. Le smoke staging traverse réellement Nginx, les deux services
et PostgreSQL, mais sa couverture doit être rendue explicite et complétée avant
les mises à jour de dépendances de `TC-110` et la revue de fermeture `TC-112`.

## Objectif mesurable

- Couvrir les scénarios d'usurpation, accès croisé, élévation de rôle,
  substitution/rejeu de clé et révocation de la Phase 1.
- Pour chaque refus critique, vérifier qu'aucune écriture ou émission
  Socket.IO dépendante n'a eu lieu.
- Exécuter un parcours black-box reproductible sur PostgreSQL staging avec
  uniquement des comptes et objets synthétiques.
- Conserver les tests rapides locaux sans dépendance obligatoire à Docker.

## Matrice minimale

| Frontière | Scénario négatif | Résultat attendu |
|---|---|---|
| JWT | access falsifié/expiré, refresh utilisé comme access | `401`, aucune écriture |
| identité | `sender.userId` d'un autre compte | refus avant SQL métier/événement |
| appareil | preuve absente/altérée/rejouée, appareil pending/révoqué | `401` ou `403`, aucune écriture |
| cercle | non-membre lisant annuaire, membres ou demandes | refus générique sans fuite |
| rôles | membre administrant une demande, admin changeant un rôle | `403`, état inchangé |
| conversation | extérieur lisant/envoyant/s'abonnant | refus, aucun message/room |
| clés | publication hors cercle, mauvaise signature/version, rejeu | refus, annuaire inchangé |
| concurrence | double décision, publication contre révocation | un gagnant, état final déterministe |

## Critères d'acceptation

- [x] La matrice est reliée à des tests nommés et reproductibles.
- [x] Les suites Auth et Messaging passent sans réseau externe.
- [x] Le parcours PostgreSQL réel couvre au minimum deux comptes isolés, deux
      rôles distincts, un appareil pending et un appareil révoqué.
- [x] Les refus critiques prouvent l'absence d'écriture et, quand applicable,
      l'absence d'événement Socket.IO.
- [x] Les tests n'affichent ni mot de passe, jeton, preuve ou clé privée.
- [x] Le staging reste sain, sans migration ni donnée non synthétique.
- [x] Les commandes, résultats, limites et rollback sont documentés.

## Résultat et preuves

- Les tests locaux relient les refus aux suites `jwt`, `acl-routes`,
  `identity`, `account-device-*`, `group-device-key-routes`, `atomic-routes`
  et `socket-security`. Auth réussit `27/27` et Messaging `90/90`.
- Le smoke black-box utilise trois comptes `example.invalid`, trois appareils
  et les rôles propriétaire, administrateur et membre sur les vrais services,
  la vraie gateway et PostgreSQL.
- Il refuse access absent, refresh utilisé comme access, preuve altérée,
  appareil pending/révoqué, accès croisés cercle/conversation/messages/clés,
  expéditeur forgé, traitement d'adhésion par un membre et changement de rôle
  par un administrateur.
- Les listes de conversations, messages, clés, demandes et membres sont relues
  après les refus critiques pour prouver l'absence d'écriture. Les suites
  locales prouvent séparément l'absence d'émission avant commit et après
  rollback.
- Le premier essai a confirmé le quota de trois inscriptions par heure : deux
  anciennes probes invalides consommaient le budget avant le troisième rôle.
  Elles ont été retirées du smoke, sans modifier le quota, et restent couvertes
  par les tests locaux de validation `TC-107`.
- Release finale staging :
  `1aeaccf31f13c31ad58ab9c332a5d4f0140c8b76`; quatre services sains, zéro
  redémarrage, labels correspondants et aucun `fatal|panic|uncaught` observé.

## Rollback exécutif

La release pré-`TC-111`
`a55d8c5ecda649bb29096ea0f4301ad7bd14e888` reste disponible. Les
configurations antérieures sont conservées en mode `0600` sous
`staging.env.before-d6da1cfa1423` et `staging.env.before-1aeaccf31f13`.
Aucune migration ni suppression de donnée n'a été effectuée.

## Plan de réalisation

1. Cartographier chaque ligne sur les tests existants et identifier les trous.
2. Ajouter les tests locaux manquants au niveau Fastify/service.
3. Renforcer le smoke PostgreSQL black-box pour les scénarios qui exigent la
   vraie base, les transactions ou Socket.IO.
4. Exécuter les suites locales puis déployer uniquement le staging.
5. Rejouer le smoke, contrôler santé, logs, redémarrages et cohérence SQL.

## Hors périmètre

- Mise à jour des dépendances (`TC-110`).
- Nouveau schéma ou outil de migration (`TC-201`).
- Fuzzing du protocole V3 (`TC-309`).
- Production et données personnelles réelles.

## Risques et rollback

Le risque principal est qu'un test black-box laisse des objets synthétiques ou
consomme les quotas de staging. Les identifiants utilisent un marqueur unique
`example.invalid`; aucun nettoyage destructif global n'est autorisé. Le
rollback repointe vers la release staging précédemment validée ; aucune
migration n'est prévue.
