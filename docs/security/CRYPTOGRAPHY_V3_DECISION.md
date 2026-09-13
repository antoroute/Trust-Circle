# Rapport de décision cryptographique V3

Statut : décision d'architecture acceptée, implémentation non commencée
Date : 2026-09-13
Tâche : `TC-301`
Décision normative : [ADR-0003](../adr/ADR-0003-protocole-crypto-v3.md)

## Réponse exécutive

CircleHaven doit remplacer son protocole V2 maison par **MLS 1.0 (RFC 9420)**
avec **OpenMLS en Rust** derrière une façade native étroite. Ce choix retire au
projet la conception des transitions cryptographiques de groupe, apporte un
format standard et fournit les mécanismes nécessaires à la forward secrecy et à
la post-compromise security. MLS a été conçu pour des groupes asynchrones de
deux à plusieurs milliers de clients, avec un coût de mise à jour qui croît
principalement comme le logarithme de la taille du groupe.[^1]

La décision ne signifie pas « sécurité terminée ». MLS s'appuie sur un service
d'authentification défini par l'application, un service de livraison et un
stockage client corrects.[^2] L'intégration CircleHaven, les credentials
d'appareil, la résistance aux appareils fantômes, la persistance atomique et le
pont Flutter/Rust seront donc inclus dans l'audit final.

## Pourquoi le V2 ne doit pas devenir la V3

Le V2 effectue un X25519 et un enveloppement de clé pour chaque appareil
destinataire, transporte une enveloppe JSON/Base64 propre au projet et signe une
concaténation ambiguë. Il a été durci pour vérifier avant affichage, mais il ne
possède ni ratchet d'époque standard, ni PCS, ni corpus d'interopérabilité.

Continuer à le corriger demanderait à CircleHaven de concevoir puis faire auditer
simultanément :

- la distribution de clés aux groupes et aux appareils ;
- les changements concurrents de membres ;
- le renouvellement et la suppression des secrets ;
- les formats canoniques, anti-rejeu et politiques hors ligne ;
- la migration et la récupération après désynchronisation.

Ce travail est précisément le domaine normalisé par MLS. Conserver le V2 comme
format historique figé est raisonnable ; l'étendre ne l'est pas.

## Ce que MLS apporte réellement

MLS organise les appareils d'un groupe dans un arbre et fait évoluer le groupe
par époques. Un ajout, retrait ou renouvellement produit un `Commit`; un nouvel
appareil rejoint avec un `Welcome` fondé sur un `KeyPackage`. Les messages
applicatifs sont des `PrivateMessage` chiffrés et authentifiés.[^1]

Les gains de sécurité attendus sont :

- **forward secrecy intra-époque** par suppression des clés de message après
  usage, et inter-époques par suppression des anciennes clés d'arbre ;
- **post-compromise security** lorsqu'un appareil introduit du nouveau matériau
  dans un `Commit`, que tous les membres le traitent et que les anciens secrets
  sont supprimés ;
- retrait d'un appareil avec changement d'époque, empêchant l'accès aux
  messages futurs ;
- protection contre altération, rejeu inter-contexte et divergence d'état selon
  les validations imposées par le standard.

Ces propriétés sont conditionnelles. Un appareil compromis en cours d'usage
peut lire son écran et sa mémoire. Un service de livraison malveillant peut
bloquer la communication. Un service d'authentification compromis peut tenter
d'introduire un faux appareil si les credentials, la transparence et les
vérifications utilisateur sont insuffisants.[^2]

## Comparaison des candidats

| Candidat | Sécurité/maturité utile | Portabilité et maintenance | Licence | Conclusion |
|---|---|---|---|---|
| OpenMLS | RFC 9420, Rust, audit indépendant 2026, interopérabilité publiée | CI Windows/macOS ; builds Android/iOS/WASM ; projet actif | MIT | retenu |
| `mls-rs` | RFC 9420 et tests d'interop, mais aucun audit tiers complet annoncé | Rust, SQLite, UniFFI et WASM | MIT ou Apache-2.0 | fallback/interops |
| MLS++ | implémentation RFC historique et active | C++17 + OpenSSL/BoringSSL, FFI et packaging plus complexes | BSD-2-Clause | interops seulement |
| Vodozemac Olm/Megolm | Rust et audit sans constat significatif annoncé | très lié au modèle Matrix | Apache-2.0 | bon logiciel, mauvais cycle de groupe cible |
| libsignal | protocole et code largement déployés | API/support centrés clients Signal, intégration multi-OS spécifique | AGPL-3.0 | non retenu |
| Wire CoreCrypto | pile MLS multi-plateforme et stockage déjà intégrés | grande surface spécifique Wire | GPL-3.0 | non retenu |
| V3 interne/V2 corrigé | aucune dépendance protocolaire | toute la conception et la maintenance à notre charge | interne | rejeté |

OpenMLS publie trois suites RFC, annonce des builds pour Android/iOS et des
tests natifs Windows/macOS, et n'implémente pas lui-même les primitives : elles
sont fournies par un backend interchangeable.[^3] Cela permet d'isoler le choix
de backend sans inventer de nouveau format.

`mls-rs` est une alternative crédible et permissive, mais son dépôt indique
explicitement ne pas avoir encore reçu d'audit tiers complet.[^7] MLS++ est
utile comme deuxième implémentation de référence, mais son C++ et ses
dépendances natives ajoutent une surface inutile pour un client Flutter sur
quatre systèmes.[^8]

Vodozemac a été audité et est écrit en Rust,[^9] mais Megolm reste une pile
Matrix/sender-key qui ne correspond pas aussi bien au besoin de PCS de groupe ;
c'est une inférence à partir de son modèle annoncé et des limites des sender
keys décrites par la RFC MLS.[^1] `libsignal` et Wire CoreCrypto sont open
source, mais respectivement AGPL-3.0 et GPL-3.0, et embarquent des choix
d'architecture propres à leurs produits.[^10][^11] Une licence copyleft
n'interdit pas automatiquement un store, mais elle
augmente les obligations et le besoin de revue juridique. OpenMLS sous MIT
réduit fortement cette incertitude.

## État de sécurité d'OpenMLS

L'audit SRLabs publié en mars 2026 a duré douze semaines.[^5] Il a combiné modèle de
menace, revue manuelle, analyse statique et fuzzing. Il a identifié huit
constats : un haut, trois moyens, deux faibles et deux informatifs. Le haut et
les moyens sont indiqués comme corrigés ; un faible sur la synchronisation entre
état de groupe et stockage était encore « acknowledged », et un risque
informatif d'allocations non bornées était accepté.[^4]

L'audit est un argument fort en faveur d'OpenMLS, mais son périmètre doit rester
compris : il couvrait principalement `openmls`, `traits` et
`basic_credential`. Les fournisseurs de primitives, le stockage, le Delivery
Service et l'application n'étaient pas audités.[^4] La version 0.9.0 publiée le
25 août 2026 ajoute notamment une migration explicite des formats de stockage,
mais reste une version pré-1.0 dont l'API peut évoluer.[^6]

Conséquences pour CircleHaven :

- verrouiller exactement OpenMLS et toutes les dépendances ;
- désactiver `content-debug`, `crypto-debug` et les fonctions de brouillons ;
- filtrer les tailles avant de donner des octets au parseur ;
- exécuter un seul acteur/file par groupe pour empêcher les courses d'état ;
- persister groupe, epoch, commit en attente et curseur dans une transaction ;
- injecter des pannes à chaque frontière de persistance ;
- inclure backend crypto, stockage, pont FFI et logique applicative dans
  `TC-312`.

## Choix des primitives

La V3 initiale utilise la suite obligatoire MLS :

`MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519 (0x0001)`.

Elle associe X25519, HKDF-SHA-256, AES-128-GCM et Ed25519. La RFC impose cette
suite à tous les clients MLS 1.0 et la classe au niveau de sécurité d'environ
128 bits.[^1] Passer à AES-256 isolément ne rendrait pas le protocole « deux fois
plus sûr » : le niveau doit être cohérent sur le KEM, la signature, le hash et
l'AEAD. La suite obligatoire est moderne, interopérable et fournit une baseline
unique à mesurer sur toutes les plateformes.

Le prototype commence avec `openmls_rust_crypto`. Le fournisseur libcrux sera
mesuré séparément : il contient des composants vérifiés, mais son propre dépôt
le décrit toujours comme pré-release et demande de contacter les mainteneurs
avant un usage de production.[^12] La vérification formelle ne remplace pas une
revue du code non vérifié, des liaisons, du compilateur et de l'intégration.

## Architecture cible

```text
Flutter/UI
  │ commandes typées, jamais de secret exposé aux widgets
  ▼
Façade asynchrone Flutter ↔ Rust
  │ create/process/commit/join/remove, appels groupés
  ▼
Moteur CircleHaven MLS (un acteur par groupe)
  ├── OpenMLS 0.9.x verrouillé
  ├── validation des credentials d'appareils
  ├── limites, politique d'époques et machine de migration
  └── stockage transactionnel chiffré
          │
          ▼
Backend Delivery Service
  ├── KeyPackages à usage unique
  ├── Welcome ciblés
  ├── ordre fort des Commit par groupe/epoch
  └── PrivateMessage opaques + curseur/idempotence
```

Le pont recommandé est une génération FFI Rust/Flutter maintenue, initialement
`flutter_rust_bridge`, sous licence MIT et annoncée compatible Android, iOS,
Windows et macOS.[^13] Il reste une dépendance de transport, pas une autorité
cryptographique. L'API exposée sera volontairement petite ; les objets OpenMLS
et les secrets ne traverseront pas vers Dart.

## Identité : le principal travail qui reste

Dans MLS, chaque appareil CircleHaven est un client distinct. Un credential
`basic` contient une identité binaire versionnée, par exemple :

```text
domain = "circlehaven/mls-credential/v1"
account_id
device_id
credential_version
mls_signature_public_key
issued_at
expires_at
```

La représentation exacte relève de `TC-302`/`TC-303`. Elle doit être liée
par signature à l'identité d'appareil déjà approuvée dans l'ADR-0005, avec preuve
de possession de la clé MLS. Le serveur publie les artefacts, mais ne possède
aucune clé privée.

Pour réduire le risque d'appareil fantôme sans imposer des vérifications
manuelles à chaque connexion :

1. tout nouvel appareil est approuvé une seule fois par un appareil actif ;
2. chaque ajout/retrait apparaît immédiatement dans le cercle et dans un journal
   de sécurité ;
3. une empreinte/QR permet la vérification volontaire entre proches ;
4. une transparence de clés avec preuves d'inclusion/consistance et détection
   d'équivocation est intégrée ou spécifiée avant la revendication d'une
   résistance forte à un serveur compromis.

Les trois premiers contrôles maintiennent une UX simple. Le quatrième peut être
automatique ; sa conception ne doit pas être improvisée dans l'ADR.

## Performances et absence de ralentissement

MLS déplace la cryptographie asymétrique coûteuse vers la création, l'ajout, le
retrait et les changements d'époque. Le coût des mises à jour d'un arbre normal
croît sous-linéairement ; celui d'un message applicatif est essentiellement
indépendant du nombre de membres.[^15] L'arrivée dans un groupe reste
nécessairement liée à sa taille, et un arbre très clairsemé peut rendre certains
`Commit` plus coûteux.

Le chemin courant de CircleHaven sera :

1. prendre l'état du groupe déjà ouvert ;
2. créer ou traiter un `PrivateMessage` dans Rust ;
3. persister atomiquement le ratchet ;
4. envoyer une requête, ou remettre le texte vérifié à Flutter.

Il ne consulte pas l'annuaire et ne crée pas de nouveau moteur. Les mises à jour
PCS sont coalescées en arrière-plan, à une fréquence de l'ordre des heures ou
jours comme le prévoit la RFC, et avec les changements de membres.[^1]

Budgets d'acceptation :

| Scénario | Porte minimale |
|---|---:|
| message visible, groupe déjà chargé | p95 ≤ 100 ms |
| message visible, état à charger localement | p95 ≤ 250 ms |
| reprise de 100 messages | p95 < 5 s |
| appel réseau supplémentaire dû à la crypto, chemin courant | 0 |
| travail lourd sur le thread UI | 0 |

Le but n'est pas seulement de passer ces plafonds : chaque benchmark compare
V2 et V3 sur le même matériel, avec p50/p95, consommation mémoire, taille du
binaire, temps de démarrage et énergie. L'initialisation de tous les groupes à
la connexion est interdite ; seuls les groupes récents sont préchargés.

## Migration V2 vers V3

La migration ne transforme jamais une clé V2 en secret MLS.

- Le client reçoit la capacité V3 mais continue à lire V2.
- Après disponibilité V3 sur tous les appareils actifs du cercle, un appareil
  autorisé crée un groupe MLS neuf et ajoute les `KeyPackage` validés.
- Le backend enregistre transactionnellement un point de bascule
  `conversation + version + epoch`.
- Tout nouvel envoi après ce point doit être V3 ; un V2 tardif est rejeté comme
  downgrade.
- Les enveloppes V2 restent lisibles par le moteur gelé et ne sont pas
  rechiffrées côté serveur.
- Un rollback applicatif peut désactiver l'envoi V3, mais ne réautorise pas
  silencieusement un envoi V2 après bascule. Il faut corriger/reprendre l'état.

Un nouvel appareil ne reçoit que les futurs messages, conformément aux ADR-0002
et ADR-0005. OpenMLS supprime la clé d'un message envoyé pour maximiser la FS ;
le client doit donc conserver sa propre copie du texte envoyé dans la base locale
chiffrée s'il doit le réafficher.[^16]

## Post-quantique

La V3 initiale ne promet pas de résistance quantique. En septembre 2026, les
suites MLS basées sur ML-KEM sont encore un Internet-Draft actif, pas une RFC
finale.[^14] Les activer maintenant créerait une dépendance à des codepoints,
formats et implémentations susceptibles de changer, ainsi qu'un coût de taille
et de performance non validé.

L'agilité MLS et la réinitialisation de groupe permettent d'ajouter plus tard
une suite hybride standardisée. Le sujet doit être réexaminé avant publication
si le statut IETF ou la menace change, puis par nouvelle ADR.

## Plan de preuve restant

La décision de protocole est prise ; `TC-301` n'est pas terminé tant que les
preuves suivantes manquent :

- façade minimale OpenMLS et stockage factice crash-safe ;
- création, ajout, retrait, update, message, reprise hors ordre et concurrence ;
- vecteurs RFC et interop avec MLS++ ou `mls-rs` ;
- build et benchmark réels Android, iOS, Windows et macOS ;
- mesure OpenMLS/RustCrypto puis OpenMLS/libcrux si ce dernier est admissible ;
- taille APK/IPA/MSIX/app, démarrage, mémoire et batterie ;
- inventaire SPDX/SBOM et validation des licences transitives ;
- traitement des constats OpenMLS sur persistance et allocations ;
- décision documentée sur la transparence des clés ;
- audit indépendant complet avant la bêta publique.

L'absence actuelle de matériel Apple est explicitement acceptée pour choisir
l'architecture, pas pour publier. Les builds et tests iOS/macOS restent
obligatoires sur macOS/Xcode.

## Sources

[^1]: IETF, [RFC 9420 — The Messaging Layer Security Protocol](https://www.rfc-editor.org/rfc/rfc9420.html), juillet 2023.
[^2]: IETF, [RFC 9750 — The Messaging Layer Security Architecture](https://www.rfc-editor.org/rfc/rfc9750.html), avril 2025.
[^3]: OpenMLS, [dépôt, plateformes, suites et licence](https://github.com/openmls/openmls).
[^4]: Security Research Labs, [OpenMLS Security Assurance Assessment v1.2](https://blog.openmls.tech/SRL-OpenMLS_security_assurance_assessment.pdf), 11 mars 2026.
[^5]: Phoenix R&D, [OpenMLS independent security audit: results, history, and what comes next](https://blog.phnx.im/openmls-independent-security-audit/), 27 mai 2026.
[^6]: OpenMLS, [OpenMLS 0.9.0 Release](https://blog.openmls.tech/posts/2026-08-25-0.9.0-release/), 25 août 2026.
[^7]: AWS Labs, [mls-rs — fonctionnalités, audit et licences](https://github.com/awslabs/mls-rs).
[^8]: Cisco, [MLS++ — implémentation et dépendances](https://github.com/cisco/mlspp).
[^9]: Matrix.org, [vodozemac — Olm/Megolm, audit et licence](https://github.com/matrix-org/vodozemac).
[^10]: Signal, [libsignal — API, plateformes et licence](https://github.com/signalapp/libsignal).
[^11]: Wire, [CoreCrypto — MLS, plateformes et licence](https://github.com/wireapp/core-crypto).
[^12]: CE Labs, [libcrux — statut de vérification, pré-release et licences](https://github.com/celabshq/libcrux).
[^13]: flutter_rust_bridge, [dépôt, plateformes et licence](https://github.com/fzyzcjy/flutter_rust_bridge).
[^14]: IETF MLS WG, [draft-ietf-mls-pq-ciphersuites-06](https://datatracker.ietf.org/doc/html/draft-ietf-mls-pq-ciphersuites), juillet 2026.
[^15]: OpenMLS, [premiers benchmarks et comportement selon la taille du groupe](https://blog.openmls.tech/posts/2021-05-18-openmls-first-benchmarks/), mai 2021.
[^16]: OpenMLS Book, [Creating application messages](https://book.openmls.tech/user_manual/application_messages.html).
