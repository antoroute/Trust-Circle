# Contexte du projet

Statut : référence de travail
Dernière mise à jour : 2026-10-04
Instantané fonctionnel documenté : branche `main`, Phases 1 et 2 terminées sur staging

## Mission

**CircleHaven — Trust Circle** est une messagerie privée destinée d'abord aux familles et groupes d'amis. Sa promesse centrale est une conversation de cercle simple, fiable et chiffrée de bout en bout, sans lecture du contenu des messages par l'opérateur du service.

Le propriétaire a choisi **CircleHaven** comme marque et **CircleHaven — Trust Circle** comme nom public le 2026-08-24. « Trust Circle » seul reste uniquement le nom historique du dépôt. La décision et les collisions résiduelles sont documentées dans `product/NAME_DECISION.md` et `adr/ADR-0004-nom-produit.md`. La vérification formelle de la marque, les réservations et le renommage technique restent requis. Dans l'intervalle, le domaine réseau provisoire est précisément `trust-circle.kavalek.fr`, sans wildcard ; il reste remplaçable et sans incidence sur le nom public.

## Cible de publication

- Obligatoire pour la V1 : Android 9/API 28+, iOS/iPadOS 15+ et Windows 11 25H2+ x64.
- Souhaité si la compatibilité est démontrée : macOS 14+ sur Apple Silicon.
- Web V1 : site public statique avec présentation, téléchargements, support, confidentialité et suppression de compte. Aucun client de messagerie Web n'est prévu en V1.

## Architecture actuelle

- Client : Flutter/Dart dans `frontend-mobile/flutter_message_app`.
- Authentification : Fastify/TypeScript/PostgreSQL dans `backend/auth`.
- Messagerie : Fastify/TypeScript/Socket.IO/PostgreSQL dans `backend/messaging`.
- Données : PostgreSQL uniquement ; Redis/Valkey est absent de la V1 par `ADR-0007` tant qu'un besoin de réplication Messaging n'est pas démontré.
- Déploiement : Docker Compose et Nginx sur un LXC Docker partagé. Les stacks historiques ont été supprimées par décision du propriétaire. Le backend staging neuf `trust-circle-staging` est publié par une gateway interne filtrée vers NPM puis par TLS sous ACL restreinte ; voir `docs/operations/STAGING_INVENTORY.md`.
- Contrat d'API existant : `docs/openapi/openapi-v2.yaml`, à réaligner avec le code avant de le considérer comme contractuel.
- Cryptographie actuelle : X25519, HKDF-SHA256, AES-256-GCM et Ed25519 côté
  Flutter, protocole maison V2 décrit dans
  `docs/security/CRYPTOGRAPHY_V2.md`. L'ADR-0003 acceptée le 2026-09-13 choisit
  MLS 1.0/OpenMLS en Rust pour la V3 ; aucun code V3 n'est encore intégré.

## Niveau de préparation

Le projet est un prototype fonctionnel, pas une version publiable. Les builds TypeScript et les suites locales Auth/Messaging réussissent. Flutter 3.47.4 fait passer les 45 tests, compile et exécute les runners profile Android 16 émulé et Windows 11 physique, et confirme l'absence d'erreur bloquante dans l'analyse statique. La couverture automatisée demeure partielle et les plateformes Apple ne sont pas encore validées. La CI backend est opérationnelle depuis TC-209 ; la CI Flutter reste à réaliser.
La Phase 2 a depuis séparé les rôles PostgreSQL (`TC-203`), durci les
conteneurs (`TC-204`), confirmé la topologie mono-réplique sans Redis
(`TC-205`) et établi une journalisation JSON corrélée et minimisée sur le
staging et son proxy TLS (`TC-206`). Les données synthétiques ont été nettoyées
après validation. `TC-207` sépare désormais vivacité et readiness PostgreSQL,
expose des métriques HTTP/runtime/Socket.IO agrégées et les fait collecter par
Prometheus sans nouveau port ni exposition publique. `TC-208` produit désormais
des sauvegardes PostgreSQL chiffrées quotidiennes hors LXC, prouve chaque
semaine une restauration isolée et alerte sur les échecs ou la fraîcheur.
`TC-209` construit et publie Auth/Messaging dans GHCR avec SBOM, analyse et
provenance signée vérifiée par digest et commit. Les nouvelles images utilisent
Node 24 LTS et des dépendances corrigées. `TC-210` a promu ces images par digest,
exercé le retour aux anciennes images puis la nouvelle promotion sans perte de
données ni changement de secrets/volume. Sauvegarde/restauration, HTTPS et
observabilité sont vérifiés après la bascule. La Phase 2 est terminée sur le
staging ; la Phase 3 a commencé par le laboratoire MLS/OpenMLS de `TC-301`.
Les 8 CVE Debian HIGH sans correctif indiqué par le scan et le stockage de
backup transitoire restent des portes avant bêta ; voir
`docs/operations/IMAGE_SUPPLY_CHAIN.md` et `BACKUP_RESTORE.md`.

`TC-301` reste en cours : son lot A natif isolé est réalisé dans
`prototypes/mls` sur la branche `tc301-mls-prototype`. Cycle de groupe,
persistance atomique, 18 cas de crash et interopérabilité mls-rs sont testés
avec RustCrypto et libcrux. Le lot B ajoute un pont Flutter isolé dans
`prototypes/mls_flutter`, la réception atomique en lot et des tests locaux
réussis. La CI Flutter `37211775266` valide le scénario graphique sur les quatre
OS (Windows/macOS profile, Android/iOS émulés/simulés debug), six jobs sur six.
Le moteur compte maintenant 19 tests/fournisseur et 20 cas de crash, validés
par la CI native `37194481919`. Prochaine sous-tâche : lot C, artefacts d'essai
et mesures comparables ; budgets de performance et preuves physiques restent
ouverts. Les pointes Windows et les frames lentes en émulation sont documentées.
Voir `quality/TC-301-FLUTTER_BRIDGE.md` pour l'état CI exact. Aucune activation
V3 ni modification du staging : voir `quality/TC-301-MLS_PROTOTYPE.md` et le
prompt `prompts/CONTINUE_TC-301.md`. Aucun compte/historique n'est à migrer.


Les principaux bloqueurs restants sont : stockage SQLite insuffisamment protégé, protocole V3 choisi mais non implémenté ni audité, fiabilité hors ligne fragile, compatibilité desktop incomplète et configuration de release non préparée. La confusion entre access et refresh tokens a été fermée par `TC-102`, l'identité d'envoi est dérivée du JWT par `TC-103`, les autorisations cercle/conversation/rôle sont centralisées par `TC-104`, et `TC-105` rend atomiques les contrôles et écritures Messaging critiques avec événements post-commit. Les lots A à D de `TC-106`, désormais validés sur staging, isolent l'identité locale, prouvent sa possession, permettent l'approbation signée, lient chaque access token à la clé privée de l'appareil et propagent rotation ou révocation globale sans détruire les clés historiques. `TC-107` borne les corps, structures, identifiants, collections et données cryptographiques HTTP/Socket.IO. `TC-108` applique une allowlist CORS exacte, une confiance proxy par CIDR, des quotas HTTP/Socket.IO sans aller-retour supplémentaire et des ACK d'abonnement immédiats ; son fonctionnement est décrit dans `security/NETWORK_BOUNDARY.md`. `TC-109` retire du client, des backends et du staging le faux secret partagé extractible, sans le remplacer ni ajouter d'appel réseau. `TC-111` rend les scénarios négatifs d'identité, ACL, rôles, appareils, clés et Socket.IO reproductibles sur les suites locales et PostgreSQL staging. `TC-110` met les deux backends à zéro avis `npm audit`, met notamment Fastify et Socket.IO à niveau et conserve les 117 tests backend ainsi que le smoke adversarial. `TC-114` impose désormais l'authentification du message avant tout usage du texte et respecte les budgets Android/Windows. Avec l'exposition TLS restreinte de `TC-113`, la Phase 1 est terminée. `TC-201` adopte Sqitch 1.6.1 et valide une baseline réversible sur PostgreSQL 16 jetable ; `TC-202` recrée le staging à vide depuis cette baseline et enregistre ses six changements. L'inventaire Docker détaillé est dans `docs/operations/PRODUCTION_INVENTORY.md`.

## Ordre de travail

1. Stabiliser le cadre : nom, inventaire de production, sauvegarde, staging, périmètre V1 et plateformes (`TC-001` à `TC-008`).
2. Fermer les vulnérabilités backend et supprimer les secrets publics partagés.
3. Introduire migrations, observabilité sûre, sauvegarde et déploiement reproductible.
4. Décider puis implémenter le protocole cryptographique V3 et le vrai multi-appareil.
5. Terminer le cycle de compte, la synchronisation fiable et la résilience hors ligne.
6. Reprendre l'UX, l'accessibilité, l'internationalisation et les adaptations de plateforme.
7. Automatiser tests/CI, réaliser les audits puis préparer les stores.

La roadmap détaillée se trouve dans `docs/roadmap/ROADMAP.md`.

Pour reprendre rapidement le projet, lire ensuite `docs/architecture/FUNCTIONAL_REFERENCE.md`, `docs/security/CRYPTOGRAPHY_V2.md` et `docs/architecture/TRACEABILITY.md`. Ces documents distinguent explicitement comportement observé, cible et écart.

## Décisions et limites actuelles

- Le cœur de sécurité ne sera jamais réservé à un abonnement payant.
- Le modèle économique n'est pas implémenté en V1 ; priorité à la validation d'usage auprès des particuliers.
- Calendrier, fichiers, localisation, appels, client Web complet et paiement sont hors V1 acceptée.
- Toutes les conversations V1 appartiennent à un cercle ; aucun message individuel hors cercle commun.
- Les rôles sont propriétaire, administrateur et membre, sans quorum d'approbation en V1.
- Un nouvel appareil ne reçoit que les nouveaux messages ; une récupération totale ne restaure pas l'ancien historique E2EE.
- Les enveloppes chiffrées sont conservées 90 jours sur le serveur par défaut.
- Ne pas affirmer « confidentialité parfaite », « forward secrecy », « post-compromise security » ou « équivalent Signal » tant que ces propriétés n'ont pas été conçues, testées et auditées.
- L'E2EE protège le contenu, pas automatiquement les métadonnées telles que comptes, appartenances, appareils, horodatages, adresses réseau et journaux techniques.

## Conventions pour le travail assisté

Une intervention doit partir d'une fiche `TC-xxx`, conserver un périmètre testable et produire des preuves de validation. Utiliser les prompts de `docs/prompts/` et respecter `AGENTS.md`. Les secrets et données réelles de production ne doivent jamais entrer dans le contexte d'un assistant.

## Points à ne pas déduire du dépôt

- La version effectivement déployée sur la VM.
- Les valeurs de configuration et l'état des certificats.
- Le schéma réel de production, les volumes, sauvegardes et règles réseau.
- L'éligibilité juridique du nom ou les déclarations cryptographiques nécessaires.

Ces éléments doivent être établis par inventaire ou validation explicite, puis documentés sans secret. L'état au 2026-08-23 est désormais inventorié, mais tout état futur doit être revérifié avant intervention.
