# ADR-0003 — Protocole cryptographique V3

Statut : Acceptée
Date initiale : 2026-08-23
Date de décision : 2026-09-13
Décision propriétaire : adoption anticipée de l'option A ; activation en production conditionnée aux preuves de `TC-301` à `TC-312`
Éléments de preuve : [rapport de décision V3](../security/CRYPTOGRAPHY_V3_DECISION.md)

## Contexte

Le protocole V2 combine de bonnes primitives, mais reste un protocole maison :
enveloppement d'une clé par appareil, format JSON et transcription signée
spécifiques au projet, cycle de clés incomplet et absence de forward secrecy
(FS) ou de post-compromise security (PCS) démontrées. Le corriger localement ne
suffit pas pour les groupes et le multi-appareil.

La cible doit conserver une ouverture de message fluide sur Android, iOS,
Windows et macOS, fonctionner de façon asynchrone et rester juridiquement
utilisable dans une application distribuée sur les stores.

## Décision

L'option A est retenue : la V3 utilisera **Messaging Layer Security 1.0**, tel
que spécifié par **RFC 9420**, dans l'architecture de **RFC 9750**.

L'implémentation de référence est **OpenMLS en Rust**, sous licence MIT, dans
une version exacte verrouillée au moment de l'intégration. La baseline minimale
est `openmls >= 0.9.0`; une version plus récente n'est retenue qu'après revue du
changelog, des avis de sécurité, du graphe de dépendances et des tests de
régression. Le code applicatif Flutter n'implémente aucune primitive ni
transition MLS.

La première version V3 impose :

- MLS `1.0` et la suite obligatoire
  `MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519` (`0x0001`) ;
- uniquement des `PrivateMessage` pour les données applicatives et, sauf
  justification spécifiée, pour les messages de contrôle ;
- un appareil actif égal à un client/membre MLS distinct ;
- un moteur Rust persistant et sérialisé par groupe, appelé de façon
  asynchrone depuis Flutter ;
- aucune fonctionnalité OpenMLS fondée sur un brouillon IETF dans la V3
  initiale ;
- aucune suite post-quantique expérimentale avant standard final, support
  stable et revue de sécurité ; la réinitialisation MLS fournira la voie de
  migration future.

`openmls_rust_crypto` est le fournisseur de primitives de référence pour le
prototype, car le fournisseur `libcrux` est encore publié en versions
préliminaires. Le choix final du fournisseur reste un point de preuve de
`TC-301` : il doit passer les mêmes vecteurs, benchmarks, audits de dépendances
et tests sur les quatre plateformes sans changer le format MLS retenu. Un
changement de fournisseur conforme à ces critères ne remplace pas cette ADR ;
un changement de protocole ou de suite obligatoire, si.

## Identité et confiance

MLS ne définit pas à lui seul la confiance dans l'identité. CircleHaven
utilisera des credentials MLS `basic` versionnés dont l'identité opaque lie au
minimum le compte, l'appareil et la version du credential. La clé de signature
MLS propre à l'appareil est liée à l'identité de compte/appareil et à son
approbation décrites par l'ADR-0005. Le serveur ne génère jamais la clé privée.

Chaque client doit valider, avant une addition ou un `Welcome` :

- la preuve de possession et la chaîne d'approbation de l'appareil ;
- le statut actif, le compte, l'identifiant d'appareil et la version ;
- la liaison entre credential, clé de signature MLS et identité approuvée ;
- l'unicité, la fraîcheur et l'usage unique du `KeyPackage` ;
- les capacités et la suite négociées sans downgrade.

Les changements de membres/appareils sont visibles dans un journal de sécurité.
Une vérification hors bande par QR code/empreinte reste disponible. La cible
inclut une transparence des clés ou un mécanisme équivalent contre les
« appareils fantômes » ; tant qu'il n'est pas audité, un service
d'authentification compromis reste un risque résiduel explicitement communiqué.

## Transport et état serveur

Le backend reste un Delivery Service sans accès aux secrets de groupe ni au
texte clair. Il conserve les `KeyPackage`, `Welcome`, `Commit` et messages
applicatifs opaques avec leurs seules métadonnées de routage nécessaires.

Il fournit un ordre fort par groupe pour les `Commit` : un seul `Commit` valide
est accepté pour un couple `(group_id, epoch)`, puis réémis au créateur avant
fusion définitive de son état local. Les messages applicatifs conservent la
file, l'idempotence et le curseur durable définis par les phases 2 et 5.

## Performance et expérience utilisateur

Un message applicatif courant utilise l'état MLS déjà local et un seul envoi
réseau. Aucun appel d'annuaire, renouvellement de clé ou aller-retour
supplémentaire n'est ajouté sur ce chemin.

Le client :

- garde un moteur Rust vivant au lieu de créer un isolate/processus par
  message ;
- charge les groupes récents en arrière-plan et les autres à la demande ;
- traite les lots de reconnexion en une seule file native bornée ;
- persiste atomiquement le nouvel état avant de rendre un message exploitable ;
- borne les groupes à 256 appareils et les entrées avant décodage, sous réserve
  de la spécification `TC-302`/`TC-305`.

Les budgets de `TC-114` restent des portes minimales : p95 inférieur ou égal à
100 ms pour un message avec état chaud, 250 ms après chargement local, et moins
de 5 secondes pour reprendre 100 messages. Les mesures doivent isoler réseau,
chargement du stockage, pont Flutter/Rust, chiffrement, validation et
transaction. La V3 n'est pas activée si elle régresse sensiblement face à V2
sur le même appareil sans correction ou décision explicite.

Les mises à jour de feuille nécessaires à la PCS sont groupées avec les
changements de membres ou exécutées en arrière-plan selon une politique
temporelle définie par `TC-304`; elles ne bloquent pas chaque envoi courant.

## Stockage, historique et récupération

L'état MLS et les messages locaux sont placés dans une base réellement chiffrée
dont la clé est protégée par le stockage sécurisé de l'OS. Les opérations d'un
groupe sont sérialisées et leur persistance est transactionnelle. Les secrets
de message consommés et les anciens secrets d'époque sont supprimés selon la
politique FS ; aucun journal ou rapport de crash ne reçoit de clé ou de texte.

Conformément au périmètre V1, un nouvel appareil n'obtient que les messages
futurs. Aucun secret V2 ne sert à dériver un état MLS et le serveur ne convertit
rien. Les messages V2 historiques restent lisibles localement par le moteur V2
gelé ; la bascule crée un groupe MLS authentifié neuf. Une éventuelle sauvegarde
historique chiffrée sera une décision distincte de récupération.

## Alternatives rejetées

### `mls-rs`

Implémentation Rust conforme et sous double licence MIT/Apache-2.0, mais son
propre dépôt indique qu'elle n'a pas encore reçu d'audit de sécurité complet par
un tiers. Elle reste une implémentation d'interopérabilité/fallback, pas le cœur
initial.

### MLS++

Implémentation RFC active et BSD-2-Clause, mais C++/OpenSSL, absence de release
publiée et couche FFI plus risquée sur quatre OS. Elle reste utile pour les tests
d'interopérabilité.

### Signal/libsignal, Olm/Megolm et Wire CoreCrypto

Ces solutions sont sérieuses, mais leur modèle de groupe, leur surface de
plateforme ou leur licence s'intègrent moins bien. `libsignal` et Wire
CoreCrypto ont des licences copyleft fortes ; Megolm n'apporte pas le même
cycle de PCS de groupe que MLS. Ajouter une pile complète spécifique à un autre
produit augmenterait aussi la surface à maintenir.

### V3 interne ou réparation de V2

Rejetées : elles conserveraient la conception de protocole, les transitions de
groupe et l'audit à la charge du projet, avec plus de risques et moins de
garanties qu'un standard interopérable.

## Limites de la décision

- MLS ne protège pas un appareil déjà compromis ni le texte après affichage.
- Les métadonnées de transport, de groupe, d'appareil et de temps restent
  partiellement visibles.
- La PCS n'existe qu'après création, livraison et traitement d'un `Commit`
  contenant du nouveau matériau, puis suppression correcte des anciens secrets.
- L'audit OpenMLS 2026 ne couvrait ni les fournisseurs cryptographiques, ni le
  stockage, ni le service de livraison, ni l'intégration CircleHaven.
- OpenMLS reste avant `1.0` : l'API peut changer. Une façade interne étroite et
  des versions verrouillées limitent ce risque.
- Aucun discours public « équivalent Signal », « inviolable » ou
  « post-quantique » n'est autorisé. Les revendications FS/PCS attendent la
  réussite de `TC-312`.

## Garde-fous de livraison

L'activation V3 exige encore :

1. spécification indépendante et modèle de menace (`TC-302` à `TC-305`) ;
2. prototype/benchmarks Android, iOS, Windows et macOS, y compris crash et
   reprise de stockage (`TC-301`, `TC-306`) ;
3. interopérabilité OpenMLS/MLS++ ou `mls-rs` sur les vecteurs RFC (`TC-308`) ;
4. tests négatifs, rejeu, concurrence, fuzzing et limites DoS (`TC-309`) ;
5. coexistence V2/V3 et rollback sans downgrade (`TC-307`) ;
6. revue de licences automatisée, SBOM, dépendances verrouillées et zéro avis
   critique/haut non traité ;
7. audit indépendant de l'intégration complète et correction des constats
   (`TC-312`).

## Écart assumé sur l'ordre des preuves

La version proposée de cette ADR exigeait un prototype sur les quatre OS avant
toute décision. Le propriétaire a demandé le 2026-09-13 de fixer maintenant le
protocole afin d'éviter de commencer la suite sur une cible indéterminée. La
décision architecturale est donc acceptée sur la base de la comparaison et des
preuves amont ; les essais matériels Apple indisponibles et les benchmarks
CircleHaven ne sont pas déclarés réalisés. Ils restent des portes de livraison
non contournables et `TC-301` demeure en cours jusqu'à leur production.

## Réexamen

Créer une ADR de remplacement si MLS 1.0 ou OpenMLS devient non maintenu, si un
audit révèle un risque non corrigeable, si les budgets ne sont pas atteignables
sur une plateforme obligatoire, ou lorsqu'une suite post-quantique standardisée
et auditée justifie une migration.
