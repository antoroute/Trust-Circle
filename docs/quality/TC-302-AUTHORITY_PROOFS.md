# TC-302 C1g-2b.1 — Preuves portables d'autorité, banc candidat

Date : 2026-11-04 — base `5ed5e46`
Statut : preuve locale réalisée ; **C1g-2b reste ouverte**
Suite de [C1g-2a](TC-302-REQUEST_ORIGIN.md), aucun format produit accepté

Instantané du 4 novembre : voir [C1g-2b.2 du 5 novembre](TC-302-DELEGATED_AUTHORITY.md)
pour le parcours positif du référent, l'historique local et le garde de divergence
ajoutés ensuite. La question de confirmation a depuis reçu la réponse C1g-A2
dans ADR-0012 ; ne pas interpréter ses mentions « en attente » ci-dessous comme
l'état courant. Les validations et limites suivantes décrivent bien C1g-2b.1.

## Résultat

Le [banc isolé](../../prototypes/mls/authority/model.mjs) ne reçoit plus un
dictionnaire modifiable de rôles comme source de vérité. Il vérifie de vraies
signatures JWS et des transitions de droits depuis deux ancres explicites :
l'identité de compte vérifiée et la création du cercle accepté. Les demandes
désignent les états exacts des droits et des appareils de leur auteur.

Une promotion ne rend plus valide une demande ancienne ; un déclassement connu
interdit également de signer aujourd'hui un ordre rattaché à son ancien rôle.
L'approbation d'appareil et les liaisons vers plusieurs contextes sont éprouvées
sans partager de secrets MLS. **Les ancres initiales restent des hypothèses
simulées : pas de parcours QR ni de référent fonctionnel.**

Le modèle est entièrement en mémoire, écrit en Node, séparé du moteur Rust et
du backend. Les noms de champs, types et limites sont expérimentaux. Ce n'est
ni un protocole CircleHaven accepté, ni un registre durable, ni un consensus.
Les règles applicatives proposées nécessitent encore revue/ADR et preuves ;
une enveloppe standard ne les rend pas automatiquement sûres.

## 1. Choix de l'outil de preuve, pas du format final

| Option | Apport / limite pour cette preuve |
|---|---|
| Proposal privée MLS | Origine déjà éprouvée C1g-2a ; dépend du groupe et de l'époque, pas une preuve portable d'approbation de compte |
| JWS avec bibliothèque existante | Signatures et sérialisation standard, vérifiables hors groupe ; disponible sans changer le graphe, retenu uniquement pour ce banc |
| COSE_Sign1 | Conteneur binaire standard pertinent à comparer pour le moteur natif ; pas de dépendance COSE directe dans le laboratoire verrouillé, aucun encodeur ajouté à la main |
| X.509 | Chaîne de certification standard possible, mais ne décide pas les rôles, consentements ou révocations applicatives ; PKI/profil et coût d'intégration supplémentaires à évaluer |

Sources primaires : [JWS, RFC 7515](https://www.rfc-editor.org/rfc/rfc7515.html),
[COSE, RFC 9052 §4.2](https://www.rfc-editor.org/rfc/rfc9052.html#section-4.2),
[X.509, RFC 5280](https://www.rfc-editor.org/rfc/rfc5280.html),
[responsabilités applicatives MLS, RFC 9750 §6.1](https://www.rfc-editor.org/rfc/rfc9750.html#section-6.1).

Le banc utilise **fast-jwt 6.3.3**, déjà verrouillé dans
`backend/messaging/package-lock.json` et installé localement. Il importe la
bibliothèque, pas le service ni ses secrets. Version vérifiée au chargement,
aucune installation ou actualisation réalisée. Licence déclarée et fichier
local vérifiés : Apache-2.0 ; [source amont](https://github.com/nearform/fast-jwt/blob/master/LICENSE.md).
Cela ne remplace pas la revue des notices/SBOM du futur client distribué.

Limite identifiée : cette version expose `alg=EdDSA`, pas le nouvel identifiant
entièrement spécifié `Ed25519`. La [RFC 9864 §2.2](https://www.rfc-editor.org/rfc/rfc9864.html#section-2.2)
déprécie l'identifiant polymorphe. Le banc fixe donc aussi le **type réel de clé
Ed25519** et teste le refus d'Ed448. Ce n'est pas une sélection définitive de
cette bibliothèque pour Rust ni une justification pour figer l'ancien profil
dans le produit. Aucun patch de bibliothèque ni fournisseur modifié.

Orientation : conserver MLS pour les messages/transitions ; employer une
enveloppe de signature standard pour les preuves applicatives portables,
choisie avec son implémentation native et ses tests d'interopérabilité avant
intégration. Ne pas réutiliser les signatures V1 ou inventer un transcript signé.

## 2. Chaîne de confiance éprouvée

1. **Compte** : l'empreinte de la genèse signée est fournie par une vérification
   hors bande simulée, avec environnement, compte et incarnation. Une genèse
   auto-signée téléchargée sans cette ancre n'établit aucune identité.
2. **Appareils** : le premier appareil ancré, puis un appareil actif, signe
   l'approbation d'un autre, avec preuve de possession de sa nouvelle clé et
   référence au parent exact. Révocation connue, incarnation ou clé réutilisée
   refusées. Un administrateur extérieur ne peut approuver pour le titulaire.
3. **Cercle** : sa genèse acceptée est une **autre ancre** ; vérifier Alice ne
   prouve pas qu'elle possède ce cercle. La genèse signée établit les rôles des
   comptes déjà vérifiés. Un changement member/admin exige la signature du
   propriétaire du parent validé, pas un rôle annoncé dans la demande.
4. **Demande** : signature par un appareil actif, rôle owner/admin, parent exact
   du cercle ET état exact d'approbation de l'auteur, cible et action distinctes,
   environnement, genèse et génération. Le propriétaire et l'auteur lui-même
   sont conservativement exclus des cibles de ce banc ; départ/transfert exclus.
5. **Liaison MLS candidate** : l'appareil approuvé signe credential, octets de
   clé, version et contexte complet, dont genèse du cercle et génération de
   conversation. Succession liée à la preuve précédente, credential inchangé.
   Deux conversations ont des clés différentes ; révoquer l'appareil invalide
   les recherches sur les deux liaisons connues.

`TrustedAccounts` conserve les objets de compte sans permettre leur substitution
sous la même racine ; Circle/Binding restent liés à ce registre. Les états
avancent seulement après validation complète. Il s'agit d'atomicité **mémoire**,
pas de transactions SQLite ni de résistance à une image restaurée.

Les octets MLS utilisés pour les bindings sont synthétiques. Ce banc ne vérifie
ni LeafNode, ni KeyPackage, ni possession de la clé MLS, ni Commit de rotation.
La signature d'identité seule ne peut autoriser leur fusion : le raccordement
au contrôle natif C1g-1/C1g-2a reste nécessaire, sans affaiblir sa validation.

## 3. Portées et droits séparés

| Preuve du banc | Portée, sans extrapolation |
|---|---|
| Révocation de compte/appareil | Retire cet appareil/incarnation du registre de son compte ; ne réalise aucun Remove MLS |
| Demande remove-account-from-circle | Désigne un compte/incarnation dans ce cercle ; ne retire pas effectivement ses feuilles et ne vaut pas bannissement global |
| Liaison d'identité à une clé | Lie des octets à un appareil et un contexte ; ne donne ni appartenance, ni rôle, ni droit d'ajout |
| Attestation de référent | Profil non pris en charge, refusé ; le chemin positif ADR-0010 reste à construire, pas validé par ces refus |

Les preuves d'approbation d'un compte peuvent être vérifiées sans détenir les
secrets de ses conversations privées. Un administrateur du cercle n'obtient
aucun secret supplémentaire. Le routage confidentiel, l'intersection avec la
liste locale des participants et l'exécution limitée C1f-A1 ne sont pas implémentés
par ce banc. La différence entre retrait de feuille, appareil global et compte
du cercle doit rester visible jusque dans les obligations durables.

## 4. Encodage et validations négatives

- JWS compact vérifié par la bibliothèque ; SHA-256 des **octets exacts** pour
  référencer les preuves, pas hash d'un JSON reparsé et réordonné.
- Algorithme autorisé explicitement, clé réellement Ed25519, `typ` distinct
  pour chaque famille et audience expérimentale obligatoire. En-têtes exacts :
  aucune URL/clé embarquée utilisée pour la confiance, pas de découverte réseau.
- Base64url strict, sans padding et avec aller-retour canonique, UTF-8 strict,
  champs exacts, tailles et collections bornées avant effets.
- JSON : le parseur existant retient le dernier champ dupliqué, comportement
  permis par [RFC 7519 §4](https://www.rfc-editor.org/rfc/rfc7519.html#section-4).
  Un test le rend explicite. **Aucune canonicalisation JSON interlangage ni
  contrat TC-305 final** n'est revendiqué ; préférer un profil strict éprouvé.

Ces contrôles suivent les principes de séparation de
[RFC 8725](https://www.rfc-editor.org/rfc/rfc8725.html), sans confondre nos
identifiants expérimentaux avec un profil enregistré ou audité.

La relecture interne a exposé et fait corriger : alias base64url d'une même
signature donnant un autre hash, absence de genèse du cercle dans les bindings,
substitution du registre par un préfixe ancien et comparaison ambiguë des noms
de champs via une virgule. Régressions dédiées ajoutées. Ces constats concernent
le banc nouveau, pas des vulnérabilités démontrées du staging.

## 5. Limites démontrées, non masquées

- **Révocation cachée** : un participant qui ne connaît pas le déclassement peut
  encore accepter une signature fondée sur l'ancien préfixe. Horodatage ou parent
  signé ne prouvent pas que l'ordre a précédé le retrait des droits.
- **Branches** : deux transitions signées concurrentes peuvent être acceptées
  séparément ; leur présentation croisée est refusée. Pas de choix automatique,
  de preuve de complétude, de convergence ni de résolution de fork. Le refus
  du candidat frère n'installe pas de quarantaine : la branche locale reste
  utilisable dans ce modèle. Contre-test explicite, garde de divergence à faire.
- **Perte de mémoire** : reconstruire tout le banc depuis les anciennes genèses
  fait perdre les révocations apprises. Aucune garantie de reprise durable.
- **Rattrapage historique** : un événement référence l'état d'appareil exact
  de son auteur ; le banc utilise seulement l'état courant. Rejouer toute une
  histoire quand ces états ont avancé nécessite un contrat de dépendances
  historiques et de comparaison avec l'état actuel, encore absent. Cela concerne
  aussi l'import d'une genèse de cercle après évolution du compte de son créateur.
- **Demandes indépendantes** : deux demandes sous la même autorité sont
  vérifiables ; le même ordre reste vérifiable plusieurs fois. Pas de registre
  d'opérations/idempotence durable ni d'ordre global déduit de la signature.
- **Changement de droits** : toute variation du parent impose actuellement une
  nouvelle preuve ; même une approbation bénigne peut rendre une demande ancienne
  inutilisable. Garde conservatrice du banc, pas UX finale acceptée.

Une preuve refusée ou absente ne doit **jamais effacer une obligation connue**.
Aucun hold ni API de reprise n'est modifié. Le sort d'une demande déjà acceptée
dont l'auteur perd ensuite ses droits fait l'objet d'une question produit le
4 novembre ; ne pas enregistrer la recommandation comme réponse du propriétaire.
En attendant : refus conservateur et attente maintenue, comme C1g-2a.

## 6. Coût et vérifications du 4 novembre

**29 fonctions Node** réussies ; syntaxe vérifiée. Relance de non-régression :
**82 fonctions moteur RustCrypto**, **3 du pont Rust**, les **30 sous-cas de
crash existants**, Clippy et formatage réussis. Ces nombres sont séparés :
les 29 tests Node ne sont pas 29 nouvelles preuves d'intégration OpenMLS.

Les signatures sont évaluées aux changements sensibles. Un événement courant
du banc nécessite une vérification, une approbation deux (approbateur et
possession). La consultation d'un binding déjà validé est locale, sans nouvelle
signature. Aucun réseau ni coût ajouté au chemin message de l'application,
puisque le banc n'y est pas intégré. Pas de budget p95 déduit de ces tests.

Tailles réellement relevées, octets ASCII d'une enveloppe, **pas chaîne complète** :
genèse compte 533 ; genèse cercle à quatre comptes 1 064 ; approbation avec
preuve de possession 1 652 ; rôle 906 ; demande 963 ; binding 904. Identifiants
synthétiques courts, non représentatifs de toute population/transport.

Limites de banc : enveloppe 16 Kio, 32 entrées d'appareil (tombstones compris),
64 comptes, 256 transitions par objet. Les quotas appareils/événements sont
testés ; pas de politique d'expiration/compactage ou limite produit décidée.

Commandes depuis la racine :

```bash
node --test prototypes/mls/authority/model.test.mjs
node --check prototypes/mls/authority/model.mjs
node --check prototypes/mls/authority/model.test.mjs
cargo test --manifest-path prototypes/mls/Cargo.toml --locked --offline --features interop --quiet
cargo test --manifest-path prototypes/mls_flutter/rust/Cargo.toml --locked --offline --quiet
cargo clippy --manifest-path prototypes/mls/Cargo.toml --locked --offline --all-targets --features interop -- -D warnings
cargo fmt --manifest-path prototypes/mls/Cargo.toml --check
cargo fmt --manifest-path prototypes/mls_flutter/rust/Cargo.toml --check
git diff --check
```

Node 20.19.2, Rust 1.99.0. Première exécution Node : un test négatif injectait
`iat` mais le builder avec `noTimestamp` le retirait ; fixture corrigée, pas
assouplissement du validateur. Relecture par sous-agent, pas audit indépendant.
Pas de nouveau benchmark, audit dépendances, fuzzing, tests Dart/UI/OS/batterie,
paquet, VM, SSH PC ou déploiement. Dernier audit TC-301 consigné : 11 octobre ;
aucune conclusion sur les releases actuelles. Manifestes, lockfiles, schéma et
deux verrous de distribution inchangés ; modifications du propriétaire préservées.
Contrôle documentaire : 105 liens relatifs dans neuf documents, 20 exigences
uniques couvertes par 20 scénarios ; TC-303/304/305 toujours « À faire ».

## 7. Suite — C1g-2b.2 avant registre et reprise

1. Éprouver le chemin positif ADR-0010 : référent lui-même vérifié, attestation
   personnelle et portée explicitement déléguée ; contradiction directe,
   référent révoqué et absence de délégation transitive. Ne pas refaire le choix UX.
2. Définir la récupération des dépendances historiques depuis un préfixe connu,
   leur validation dans l'état antérieur et leur comparaison aux révocations
   actuelles, sans transformer l'horloge ou le serveur en preuve de fraîcheur.
3. Formaliser les ancres acceptées à l'entrée et la frontière registre/MLS ;
   limiter le coût des preuves longues et des mises à jour concurrentes.
4. Consigner la réponse sur une demande dont l'auteur perd ses droits. Cette
   question ne remet pas en cause Q3 ni le droit limité d'exécution C1f-A1.
5. Ensuite : réception durable des preuves/obligations et crash/rejeu, validation
   de toutes les cibles et départ sérialisé, avant tout unlock. Format natif,
   interopérabilité, stockage et audit restent des portes d'intégration.

S03/S04/S10/S12 restent partiels ; R01–R08, TC-301 et TC-302 restent ouverts.
TC-303/304/305 ne démarrent pas. Retour arrière : retirer uniquement ce banc
isolé de fixtures ; aucune donnée produit ou base native à convertir/effacer.
