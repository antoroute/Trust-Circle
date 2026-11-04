# TC-302 C1g-2a — Origine MLS des demandes et continuité locale

Date de validation : 2026-11-04
Base : `8a41ff8`, suite de [C1g-1](TC-302-COMMIT_POLICY_GATE.md)
Statut : sous-lot local réalisé ; **C1g-2 reste ouverte**, pas de registre ni de reprise

## Résultat et périmètre exact

Une demande de retrait peut maintenant provenir d'une **Remove Proposal privée
MLS réellement authentifiée**, et non d'un objet Request injecté. Le contrôle
résout son auteur et sa cible dans l'état courant, vérifie la politique fournie,
puis enregistre ensemble la proposition et l'arrêt des publications du groupe.
Un autre participant peut exécuter cette demande par référence, conformément
au périmètre limité de C1f-A1, avec nouveau contrôle avant fusion.

Ce résultat suppose des **pins initiaux compte/appareil/clé et rôles de confiance
injectés dans les tests**. Le parcours QR, les attestations du référent, les
approbations d'appareil et les changements de rôles ne sont pas implémentés.
Le hook n'est pas un validateur CircleHaven complet : un callback permissif
ne prouverait aucune autorité produit. Aucune revendication de protection
de bout en bout contre un annuaire compromis n'en découle.

Le sous-lot a été borné à **C1g-2a** : l'origine et la succession *dans un groupe*
peuvent être éprouvées sans nouveau format de signature. C1g-2b devra encore
établir les preuves d'autorité/continuité indépendantes des époques et des
conversations. Ne pas annoncer C1g-2 achevée ni passer directement à l'unlock.

Ni primitive, signature V3 ad hoc, dépendance, lockfile, feature en brouillon,
schéma ou fournisseur modifié. SQLite reste non chiffré, données synthétiques,
transport simulé ; aucune intégration backend/Flutter ni levée du gel TC-301.

## 1. Ce qui est authentifié, ce qui ne l'est pas

| Élément | Preuve du sous-lot / limite |
|---|---|
| Auteur d'une Proposal privée | Vérifié par `process_message`, pas par un champ serveur ; ancre d'identité initiale supposée connue |
| Auteur d'un Commit exécutant | Distinct de celui de la Proposal référencée ; aucune promotion implicite de l'exécutant |
| Cible | Feuille résolue vers la paire credential/clé et son identité de fixture à cette époque |
| Portée | **Cette feuille dans ce groupe à cette époque** ; ni exclusion du compte entier, ni révocation globale de son appareil |
| Succession de clé | Commit authentifié par l'ancienne clé et nouvelle feuille validée par MLS, credential inchangé ; liaison locale seulement |
| Rôles et racines | Hypothèses de fixture, non obtenues d'une chaîne cryptographique V3 |
| Fraîcheur globale | Non prouvée ; un serveur peut retenir une demande ou présenter des branches différentes |

La Remove standard porte un indice de feuille. Une seule demande ne peut donc
pas être interprétée comme « bannir ce compte et tous ses futurs appareils ».
Le test positif conserve explicitement le second appareil du compte visé.
La réception d'une demande dans une conversation ne prouve rien à un pair
d'une autre conversation qui n'en possède pas l'état MLS.

## 2. Réception, stockage et erreurs

[Device](../../prototypes/mls/src/lib.rs) expose
`receive_removal_proposal_with_policy_synthetic` :

1. Bornage d'entrée existant, décodage exact, format privé uniquement.
2. Transaction SQLite, garde de restauration, chargement du groupe et plafond
   de 256 propositions en attente avant nouveau traitement.
3. Authentification MLS, groupe/époque courants, auteur membre, Remove par référence.
4. Callback synchrone en lecture : contrôle de l'identité, de la cible et des
   droits depuis la vue antérieure. Aucun réseau ni effet externe autorisé.
5. Stockage OpenMLS de la proposition et insertion du hold C1f dans la même
   transaction ; le ratchet de réception participe à cette atomicité.

Échec crypto, politique refusée ou preuve manquante : aucun nouveau hold ni
proposition persistée ; écritures de ratchet de cette tentative annulées,
états antérieurs conservés. Après autorisation complète mais
échec SQL, un latch bloque l'acteur courant ; les autres connexions/restarts
ne sont protégés qu'après persistance réussie. Le retry exact est testé.
Une erreur après commit laisse proposition et hold durables : consulter l'état,
pas réinterpréter un échec de réponse comme une absence d'effet.

Un écho de sa propre Proposal n'est pas un nouveau chemin d'autorisation.
Les builders de tests appellent directement OpenMLS : la création y stocke déjà
la proposition locale. **Ils n'implémentent pas une outbox de demande fiable ni
la validation produit du chemin d'émission.** Ne pas les copier dans Flutter.

La file ne croît pas avec une retransmission du même contenu authentifié
sous un nouveau ciphertext ; le ciphertext exact déjà consommé est refusé.
Au plafond, toute nouvelle réception est refusée avant callback, même si elle
aurait été un doublon. Limite de laboratoire, pas politique anti-DoS complète.

Le chemin de réception des Commit distingue désormais exactement
`InvalidCommit(MissingProposal)` → `PolicyEvidenceRequired` : récupérer la
dépendance, puis retenter les mêmes octets. Ce classement concerne aussi le
`receive` historique, qui reste néanmoins **sans politique CircleHaven** et
refuse toujours les Proposal comme entrées métier. Le pont ne passe pas par
le nouveau hook. Les autres erreurs MLS gardent leur classement générique.

## 3. Politique et continuité éprouvées

[authenticated_proposal_tests.rs](../../prototypes/mls/src/authenticated_proposal_tests.rs)
est uniquement `cfg(test)`. `PriorView` ne contient aucune demande préinjectée.
Il réutilise les ancres de C1g-1, vérifie paire credential/clé non ambiguë,
identité active, compte/incarnation et rôle antérieur. Il accepte le retrait
d'une autre feuille du même compte par son appareil approuvé ; pour un autre
compte, il impose propriétaire/admin et protège le propriétaire conservativement.
Ce n'est pas le contrat complet de départ/transfert de propriété.

Avant fusion propre ou distante, il exige des références présentes dans le
stockage local authentifié et revalide leurs auteurs/droits. Une Remove inline
ne reprend pas les droits du propriétaire ; Add ou retrait surnuméraire refusés.
Un exécutant inactif ou visé par une demande connue ne peut exécuter le contrôle.
Le parseur n'accepte jamais une `QueuedProposal` JSON envoyée par le réseau.
La représentation normalisée stockée dans cette file locale de confiance ne
conserve pas une preuve signée portable à revalider indépendamment par un tiers.

L'essai de succession dérive un nouveau pin dans le callback du Commit validé,
seulement pour le même credential et la même identité. Il ne publie le pin
mémoire qu'après succès SQL. Une erreur avant commit ne le conserve pas.
Une vraie signature avec la nouvelle clé est ensuite acceptée et l'ancienne
refusée. Changer de credential/identité ou tourner la clé d'un exécutant déjà
visé est refusé. **La chaîne de pins reste en mémoire et le magasin persistant
de signer Device n'est pas tourné** : l'émission suivante avec la nouvelle clé
utilise un helper explicite de test. Pas de reprise après crash de cette chaîne,
de continuité inter-groupes ou de guérison d'une identité compromise démontrée.
Un contre-test supplémentaire dans le test de rotation simule une erreur
**après** commit SQL : MLS avance, mais le pin mémoire n'est pas publié. La
politique refuse ensuite la vue incomplète, même après actualisation de l'époque.
Cela expose l'atomicité manquante du helper, pas une récupération implémentée ;
les anciennes API permissives ne sont toujours pas un parcours produit sûr.

## 4. Deux contre-exemples qui maintiennent C1g-2 ouverte

**Update concurrent :** un Commit préparé avant la demande peut avancer l'époque
sans retirer sa cible. OpenMLS purge alors les propositions en attente ; leurs
anciens octets ne sont plus utilisables dans l'époque suivante. Le hold reste
actif et les envois bloqués. La ProposalStore n'est donc **pas** le registre
durable des obligations : il faut conserver séparément cible stable et provenance.

**Rôle modifié à la même époque :** un membre signe une demande, refusée faute
de droits. Le test remplace ensuite son rôle de fixture par admin sans transition
MLS ; les mêmes octets deviennent acceptables. Ce n'est pas une faille nouvelle
du staging ni un protocole de promotion implémenté : c'est la démonstration
qu'une signature et l'antirejeu MLS ne suffisent pas à figer l'autorité passée.
Un rôle lu dans un annuaire courant ne peut remplacer la référence authentifiée
à l'état de droits applicable à la demande. Ce contre-exemple n'est pas une défense.

Ces résultats interdisent de présenter une simple table de Proposal comme
la solution complète Q3. Aucun hold n'est retiré, même après un Remove réussi.

## 5. Validations du 4 novembre

Linux local, Rust 1.99.0, OpenMLS 0.9.0/RustCrypto, verrouillé et hors ligne :
**82 fonctions moteur**, dont **14 nouvelles**, et **3 tests Rust du pont**
réussis ; Clippy sans avertissement, formatage vérifié. Les quatre tests de
crash existants pilotent toujours **30 sous-cas de processus**. Le nouveau lot
injecte des erreurs transactionnelles mais n'ajoute pas de crash brutal.

Couverture nouvelle : source signée contre rôle, signature de mauvaise clé,
ciphertext altéré, autre groupe/contenu, pins/rôles/vues manquants, replay,
restart, échec avant/après commit SQL et trigger d'échec, références manquantes,
révocation/déclassement avant fusion propre/distante, inline/Remove+Add/retrait
supplémentaire, garde global, plafond, rotation et les deux contre-exemples.
S03/S04/S10/S12/S13 restent **partiels laboratoire** ; invariants 7/10/11/12/16/21
concernés sans validation globale. Aucun constat R01–R08 fermé.

Commandes : celles du [rapport C1g-1](TC-302-COMMIT_POLICY_GATE.md), plus filtre
`cargo test --manifest-path prototypes/mls/Cargo.toml --locked --offline --features interop authenticated_proposal_tests`.
Les premiers essais ont corrigé le montage de test (accesseur public
`proposal_reference_ref`, assertions sans Debug de ciphertext et sans comparer
directement `Fault`). Pas de modification de bibliothèque pour faire passer
ces erreurs, ni d'échec de non-régression sur l'ancien code revendiqué.

Relecture interne par sous-agent, pas audit indépendant. Les modifications
documentaires préexistantes du propriétaire sont conservées hors commit.
Contrôle de 98 liens relatifs dans huit documents, 20 exigences couvertes par
20 scénarios, trois fiches suivantes toujours « À faire », `git diff --check` réussi.
Pas de benchmark, libcrux, audit de dépendances actualisé, fuzzing, UI/Dart,
matrice OS, batterie, paquet, VM/PC ou déploiement. Le dernier audit consigné
reste celui du 11 octobre ; aucune conclusion sur les releases actuelles.
Le chemin applicatif courant ne fait pas de nouvel appel réseau ; aucun budget
de latence n'est déduit de la durée des tests. Les deux verrous restent actifs.

## 6. Suite et portes restantes

**C1g-2b — source d'autorité et continuité inter-contextes**, avant le registre :

- Définir l'ancre vérifiée et le lien identité de compte/incarnation → appareils
  approuvés → clés MLS, en conservant la distinction direct/référent ; aucun
  changement silencieux de racine ni réemploi de signature V1.
- Lier une demande à son contexte, sa cible stable, son action et à une vue
  d'autorité antérieure authentifiée et immuable. Comparer les options de preuve
  standard, leurs coûts et leur disponibilité ; ne pas inventer un codec signé.
- Distinguer retrait de feuille, révocation d'appareil global et exclusion de
  compte. Prévoir le transport des preuves vers les conversations privées sans
  accorder de secrets supplémentaires à un administrateur extérieur.
- Prouver rejeu après changement de rôle, succession, incarnation remplacée,
  demandes concurrentes et preuve retenue/divergente. Une chaîne signée ne
  garantit pas l'absence de révocation cachée.

Ensuite seulement : source/rejeu durables, obligations transactionnelles par
identité, couverture de toutes les cibles, contrôle de publication sérialisé,
reprise sans enlever les autres gardes, puis Q2/Q5. Aucun nouvel arbitrage UX
n'est nécessaire pour le sous-lot livré ; les choix déjà reçus restent acquis.
Les blocages ci-dessus sont techniques et ne sont pas contournés par les tests.

Retour arrière : code précédent uniquement avec de nouvelles fixtures jetables ;
ne pas effacer un hold ni utiliser un ancien binaire pour contourner l'arrêt.

Sources primaires consultées : [Remove RFC 9420 §12.1.3](https://www.rfc-editor.org/rfc/rfc9420.html#section-12.1.3),
[références MLS §5.2](https://www.rfc-editor.org/rfc/rfc9420.html#section-5.2),
[responsabilité des ACL RFC 9750 §6.1](https://www.rfc-editor.org/rfc/rfc9750.html#section-6.1),
[traitement OpenMLS](https://book.openmls.tech/user_manual/processing.html).
API vérifiée aussi dans les sources locales verrouillées 0.9.0 ; les règles de
`PriorView` sont des hypothèses CircleHaven de test, pas des garanties du standard.
