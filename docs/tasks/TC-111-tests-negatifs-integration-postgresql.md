# TC-111 — Tests négatifs et intégration PostgreSQL

Statut : En cours — matrice et couverture à compléter
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

- [ ] La matrice est reliée à des tests nommés et reproductibles.
- [ ] Les suites Auth et Messaging passent sans réseau externe.
- [ ] Le parcours PostgreSQL réel couvre au minimum deux comptes isolés, deux
      rôles distincts, un appareil pending et un appareil révoqué.
- [ ] Les refus critiques prouvent l'absence d'écriture et, quand applicable,
      l'absence d'événement Socket.IO.
- [ ] Les tests n'affichent ni mot de passe, jeton, preuve ou clé privée.
- [ ] Le staging reste sain, sans migration ni donnée non synthétique.
- [ ] Les commandes, résultats, limites et rollback sont documentés.

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
