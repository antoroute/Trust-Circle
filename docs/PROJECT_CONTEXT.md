# Contexte du projet

Statut : référence de travail
Dernière mise à jour : 2026-10-23
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
Le lot C1 ajoute les chronométrages transactionnels, trois séries de mesures
et des paquets autonomes Windows/Pixel. Les CI `37323916095` et `37323916119`
sont vertes sur `27ab9c6` (preuves du 5 octobre) : 20 tests moteur/fournisseur,
20 cas de crash, 18 tests Flutter et scénarios graphiques des quatre OS.
Le nouvel audit du 11 octobre échoue sur RUSTSEC-2026-0329/0330/0331.
Le propriétaire décide de **suspendre les nouveaux paquets en attendant une
version amont compatible**, sans fork ni changement de fournisseur. La CI
et le script de packaging bloquent la distribution. Les budgets, la baseline
V2 et les preuves physiques restent ouverts ; pas de nouveaux essais utilisateur
avec les anciens paquets. Voir `quality/TC-301-MEASUREMENTS.md` pour les mesures
et `quality/TC-301-SECURITY_HOLD.md` pour la reprise, avant C2.
Aucune activation
V3 ni modification du staging : voir `quality/TC-301-MLS_PROTOTYPE.md` et le
prompt `prompts/CONTINUE_TC-301.md`. Aucun compte/historique n'est à migrer.

La préparation documentaire de `TC-302`, ouverte le 12 et actualisée le 17 octobre,
contient le socle V3 v0.5
dans `security/CRYPTOGRAPHY_V3.md`, exigences et scénarios d'acceptation, sans
code intégré ni décision de fournisseur. TC-301 n'est pas clôturée et la
suspension reste en vigueur. La revue interne TC-302 lot B est consignée dans
`quality/TC-302-SPEC_REVIEW.md` : huit constats ouverts, fiches TC-303/304/305
préparées mais non démarrées. La première étude C1 est disponible dans
`security/V3_FEASIBILITY_STUDY.md` : journal de candidats recommandé, protection
`reuse_guard` MLS distinguée d'un anti-rollback, première confiance et composants
de transparence comparés. Aucun constat fermé ni solution technique acceptée.
Q4 est consignée le 17 octobre dans `adr/ADR-0009-verification-identite-initiale.md` :
vérification initiale obligatoire par QR/empreinte sur canal fiable, renouvelée
après remplacement complet d'identité, pas par connexion/message. Le contrat
de groupe et la détection d'équivoque restent à compléter ; ne pas redemander ce choix.
Le complément `security/V3_ADMISSION_RECOVERY_STUDY.md` consigne C1b : délégation
explicite au référent vérifié acceptée dans ADR-0010 ; périmètre de restauration
V1 accepté dans ADR-0011, sans garantie de détection d'images complètes.
Les preuves et mécanismes restent ouverts. Libération du Welcome après fusion
locale et transaction d'admission sont proposées, pas des garanties implémentées.
La suite est TC-302 C1 : stabilisation de l'admission R02 et de la barrière de
révocation Q3, puis hors ligne Q2 (`prompts/CONTINUE_TC-302.md`) ;
la validation finale de TC-302 attend TC-301.
TC-307 est réalignée sur un démarrage V3 à vide, sans coexistence de données V2
ni downgrade. Les divergences des anciens documents sont tracées dans le socle,
sans écraser les modifications locales du propriétaire.

À la demande de mise en place du 17 octobre, **TC-302 C1c** ajoute un garde
local de restauration dans le laboratoire Rust, sans intégration produit :
signal externe persistant, opérations MLS/outbox bloquées, inbox lisible,
pas de détecteur ni de déblocage automatique. Trente tests Rust réussis sur
Linux/RustCrypto, dont dix nouveaux ; preuve de rollback du KeyPackage après
rejet applicatif et contre-exemple au faux anti-rollback d'un marqueur local.
Voir `quality/TC-302-RECOVERY_GUARD.md`. Dépendances et suspension inchangées ;
aucun constat fermé, aucun budget multiplateforme nouvellement validé.

Le 18 octobre, **TC-302 C1d** ajoute le Welcome différé jusqu'à fusion locale
durable et l'invalidation atomique du pending perdant. Huit nouveaux tests :
38 fonctions moteur réussies, dont deux pilotent 24 cas de crash ; 3 tests Rust
du pont réussis. L'extension standard d'arbre est alignée à la jonction pour
permettre les admissions ultérieures. Un contre-exemple démontre deux branches
incompatibles sous livraison divergente : pas de garantie d'accord global.
Voir `quality/TC-302-ADMISSION_RELEASE.md`. Q3 est acceptée : attendre le retrait
sécurisé si aucun appareil habilité n'est disponible, lecture/brouillons et
autres conversations disponibles. Ne pas redemander ce choix ; la preuve levant
la barrière reste ouverte. `adr/ADR-0012-livraison-admission-v3.md` reste proposée
pour le contrat complet. Ni intégration, ni nouveaux paquets, ni constat fermé.

Le 23 octobre, **TC-302 C1e** invalide les anciennes sorties applicatives dans
la transaction de fusion MLS, avec trace d'idempotence et contrôles historiques
conservés pour le rattrapage. Dix nouveaux tests : 48 fonctions moteur et
3 du pont Rust réussies, dont trois tests moteur pilotent 28 cas de crash.
Schéma labo v4, anciennes sorties applicatives v3 bloquées conservativement.
Les contre-exemples distinguent époque avancée, retrait réel, indice de feuille
réutilisé et Welcome ancien valide. Voir `quality/TC-302-EPOCH_OUTBOX.md`.
L'ADR-0012 précise les conditions nécessaires, pas une preuve suffisante contre
l'équivoque ; aucune barrière Q3 complète implémentée. Prochaine sous-tâche :
**C1f, signal et portée de la barrière Q3 / admission R02**, puis Q2. Ni nouveaux
paquets, ni intégration, ni constat fermé ; gel et dépendances inchangés.

Réponse produit du 12 octobre : le propriétaire demande un partage facultatif
d'historique vers un nouvel appareil **et une nouvelle personne**, sous réserve
d'un coût raisonnable en ressources et complexité. Voir
`adr/ADR-0008-partage-historique-optionnel.md` (proposée). Ne pas considérer Q1
comme acceptation du seul accès aux messages futurs. Admission MLS et copie
sélective d'historique sont à distinguer ; aucune ancienne clé MLS à transférer.
Autorité de partage décidée le 12 octobre : vers une nouvelle personne,
propriétaire ou administrateur participant à la conversation, avec choix de la
période et événement visible par les membres ; vers son propre appareil,
confirmation depuis un appareil déjà approuvé. Le contrat détaillé, la
faisabilité et l'inclusion V1 restent à valider ; rien n'est implémenté.


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
- La baseline excluait l'ancien historique sur un nouvel appareil ; le partage
  facultatif appareil/personne est maintenant demandé et étudié dans l'ADR-0008.
  La récupération du compte ne recrée toujours pas les clés ou contenus perdus.
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
