# TC-302 C1f — Source des révocations et arrêt ciblé

Date : 2026-10-23
Base : `d7993d1`, suite de [C1e](TC-302-EPOCH_OUTBOX.md)
Statut : contrat de signal proposé ; arrêt local testé ; authentification et reprise non implémentées

## Résultat et périmètre

Le laboratoire sait maintenant **arrêter les publications d'un seul groupe**
avant sa transition MLS, sans bloquer la réception ni les contrôles nécessaires
au retrait. Ce point d'entrée reçoit uniquement un signal injecté par les tests.
Il ne reçoit pas une preuve de révocation et ne vérifie ni auteur, ni cible,
ni rôle. Aucun déblocage n'est exposé, même après un Remove réussi.

Cette étape ne réalise donc pas Q3 de bout en bout. Elle démontre le comportement
d'arrêt et prépare son entrée de confiance, sans simuler un validateur avec un
booléen `verified=true`. Le parcours produit devra aussi permettre une reprise
sûre : l'absence actuelle d'unlock n'est pas une nouvelle politique UX acceptée.

## 1. Ce qui existe et ce qui manque

Lecture du [protocole V1](../security/DEVICE_TRUST_PROTOCOL_V1.md), du
[constructeur de preuve](../../backend/messaging/src/security/deviceApproval.ts),
de la [route de décision](../../backend/messaging/src/routes/account.deviceApprovals.ts)
et du [consommateur Socket.IO](../../frontend-mobile/flutter_message_app/lib/core/services/websocket_service.dart).
Aucun de ces fichiers n'est modifié ou retesté ici.

- La révocation V1 est une décision Ed25519 de 216 octets liant compte,
  approbateur, cible, clés, versions, décision, nonce et expiration de challenge.
  Le serveur revalide les états sous verrou avant coupure du registre et des clés.
- Les événements `device:revoked` et `device:key-directory-changed` transportent
  des identifiants, pas cette preuve et sa chaîne d'autorité pour les pairs.
  TLS/authentification du transport ne les transforme pas en preuve E2EE.
- Le challenge court et son résultat serveur ne constituent pas un journal
  durable de révocations V3 vérifiable indépendamment. L'expiration d'un challenge
  ne doit surtout pas réautoriser une incarnation déjà révoquée.
- Le credential MLS `basic` du laboratoire reste une identité synthétique
  auto-déclarée. Il n'existe pas encore de liaison complète compte/appareil/clé MLS.

Conclusion : ne pas brancher directement un événement V1 sur une suppression de
membre ou un déblocage V3, et ne pas réutiliser sa signature sous un nouveau domaine.
Ce n'est pas une nouvelle faille démontrée du staging, dont le contrat actuel est V1/V2.

## 2. Trois niveaux d'entrée, proposition de contrat

| Entrée reçue | Effet admissible dans la cible | Ce qu'elle ne prouve pas |
|---|---|---|
| Indication serveur, push ou annuaire changé | Invalider le cache concerné et programmer une vérification bornée ; mettre l'envoi en attente si la fraîcheur requise manque | Autorité de retrait, nouvelle identité ou reprise sûre |
| Demande authentifiée et autorisée, avec contexte complet | Enregistrer une obligation durable et bloquer les publications concernées | Que le retrait MLS a été exécuté partout |
| Transition MLS et politique applicative validées | Mettre à jour les cibles encore présentes et les obligations dans la même transaction | Absence de révocation cachée ou accord global d'un DS divergent |

Une signature malformée ou définitivement non autorisée ne crée pas une
révocation légitime. Une preuve manquante reste indéterminée, pas invalide par
supposition. Limiter tailles, files et retries ; ne pas permettre à n'importe
quel paquet de déclencher un verrou permanent. Le hook C1f n'est **pas** ce
classificateur et n'est exposé à aucun transport réel.

## 3. Cible et autorité à lier avant toute reprise

La cible logique comprend environnement, identité/incarnation du compte et
appareil/incarnation. La portée distingue révocation globale d'un appareil,
retrait d'un compte d'un cercle et retrait d'une conversation. L'application
résout ensuite les conversations et générations concernées depuis ses liaisons
validées, pas depuis la seule liste envoyée par le serveur.

Le numéro de feuille sert uniquement à construire le Remove dans l'état courant.
Un changement de credential ou de clé MLS ne doit pas faire disparaître la cible :
il faut vérifier la succession d'identité et conserver le lien d'incarnation.
Un compte retiré ne peut revenir via un appareil nouvellement ajouté à l'annuaire.
Un groupe inconnu ou une liaison incomplète ne devient pas « non concerné » par défaut.

Référence standard : le credential basic est une assertion ; validation et
succession d'identité relèvent de la politique applicative, et l'indice de feuille
n'est pas durable entre époques. [RFC 9420 §5.3–5.3.3](https://www.rfc-editor.org/rfc/rfc9420.html#section-5.3).
Les ACL de changement de membres sont également applicatives.
[RFC 9750 §6.1](https://www.rfc-editor.org/rfc/rfc9750.html#section-6.1).
Les exigences CircleHaven suivantes sont notre proposition, pas un nouveau format MLS.

| Décision | Autorité à prouver ; pas seulement le transporteur |
|---|---|
| Révoquer un appareil de son compte | Appareil approuvé habilité du même compte, continuité connue et incarnation exacte ; pas le seul JWT ou annuaire |
| Retirer une personne du cercle | Propriétaire/admin habilité dans un état de rôles antérieur authentifié ; contraintes du dernier propriétaire conservées |
| Retirer d'une conversation privée | Autorité et portée de conversation vérifiées ; aucun droit de lecture supplémentaire pour un admin extérieur |
| Récupération totale sans ancienne clé | Nouvelle identité, nouvelle vérification ADR-0009 ; le serveur ne signe pas à la place de l'ancienne racine |

L'événement devra lier opération idempotente, action, cible/incarnation,
périmètre, auteur et référence à l'état d'autorité vérifié. Forme canonique,
preuve de succession/rôle, validation des conflits et distribution restent à
spécifier/tester ; aucun format filaire ou signature V3 inventé dans ce lot.
La preuve ne peut pas s'autoriser depuis le rôle qu'elle vient de modifier.

### C1f-A1 — Qui exécute un retrait déjà autorisé ?

Question posée au propriétaire, réponse en attente : permettre à **tout appareil
encore autorisé dans la conversation** d'appliquer un retrait dont la demande
et l'autorité ont été vérifiées, ou réserver cette exécution à un propriétaire/
admin participant. Première option recommandée pour réduire l'attente, sans
lui donner le droit de décider un retrait, ajouter un membre ou lire un autre groupe.

Ce n'est pas une répétition de Q3 : l'attente sécurisée est déjà acceptée.
L'accord éventuel ne validera ni le format de preuve ni le résolveur. Le moteur
de laboratoire n'a toujours aucun contrôle de rôle ; ses contrôles disponibles
ne constituent pas une implémentation de cette permission proposée.

## 4. Reprise proposée et admission

L'obligation de retrait doit survivre au pending perdant, aux Updates et aux
redémarrages. Elle ne doit pas être supprimée parce qu'un numéro d'époque
augmente. Le résolveur devra établir l'absence de toutes les incarnations visées,
l'absence d'autre obligation connue et la validité du contexte/droits courants.
Une nouvelle admission ne contourne pas la liste de révocations connue.

Les autres gardes restent indépendants : restauration, divergence et preuve
manquante. Résoudre une obligation de retrait ne les efface pas. L'obligation
terminée garde une trace anti-rejeu ; un retrait ne s'annule pas par timeout.
La reprise, l'état MLS et la disposition des sorties doivent être atomiques.
Sérialiser également le départ réel du transport ; un snapshot SQL cohérent
n'annule pas des octets qu'un autre appel a déjà obtenus.

Pour un nouvel arrivant : contexte attendu, racine/chaîne d'appareil et
référent déjà vérifiés, autorité de l'admission, membres et révocations connues
doivent être contrôlés en plus de MLS. Ni ancien Welcome valide ni réponse
du même serveur/auteur ne prouve une fraîcheur indépendante. Les contrôles
d'admission restent transactionnels avec consommation du KeyPackage.

Le service opaque applique séparément ACL et barrière de publication, sans
déclarer un Commit valide. Sa levée et l'équivoque DS restent R02/R03 ouverts.
Aucun quorum, external join automatique ou fusion de branches maison.

## 5. Arrêt local exécuté dans C1f

`hold_group_synthetic(group, fault)` dans [Device](../../prototypes/mls/src/lib.rs)
enregistre un marqueur par groupe existant dans `probe_group_hold`, schéma 5.
Un latch mémoire bloque cet acteur dès réception du signal borné, même si
l'écriture échoue. La persistance est idempotente, sous `BEGIN IMMEDIATE`.

| Opération pendant le hold | Comportement testé |
|---|---|
| `send`, retry de message, nouvel `add` et retry d'Add | `GroupHeld` avant travail MLS ; aucune nouvelle outbox |
| Lecture d'une outbox applicative | Refus ; les sorties déjà `superseded` restent terminales |
| Welcome pending ou déjà fusionné | Masqué dans l'outbox, même après fusion et restart |
| Contrôles Update/Remove, réception simple ou en lot | Restent possibles sous les limites actuelles du laboratoire |
| Historique validé et autre groupe | Conservés et accessibles |
| Fusion, pending perdu, retrait effectif | N'effacent jamais le hold ; aucune API unlock |
| Signal global de restauration | Prioritaire : contrôles et réception sont aussi bloqués selon C1c |

Un Commit historique peut rester accessible pour le rattrapage : disponibilité
des octets ne signifie pas autorisation de publication actuelle. Un Add déjà
préparé peut encore être fusionné lors du rattrapage ; son Welcome reste masqué.
Les autorisations de contrôles et le validateur de cible ne sont pas ajoutés ici.

Échec SQL ou crash avant persistance : les autres acteurs/restarts ne sont
pas garantis arrêtés. Une source durable devra rejouer l'obligation **avant**
reprise des publications. Crash après commit : le marqueur est relu au restart.
Les octets obtenus avant arrêt ne peuvent pas être rappelés. Les snapshots
complets peuvent restaurer aussi ce marqueur : aucune preuve anti-rollback.

Migration v4→v5 : ajout atomique de la table, inbox et garde global préservés ;
table manquante dans une base déjà v5 : erreur, pas recréation silencieuse.
Une ancienne base n'invente pas les événements jamais enregistrés. Arrêter
tous les acteurs avant mise à niveau ; pas de binaire ancien simultané, de
downgrade ou de suppression du marqueur pour reprendre. Nouvelles fixtures
jetables pour revenir au code précédent, aucune donnée produit concernée.

Coût ajouté : recherche indexée locale pour envoi/admission/outbox et une
écriture par signal. Pas d'appel réseau ni de parcours de toutes les conversations
par message. Pas de benchmark exécuté : aucune garantie p95 ou batterie nouvelle.
Le produit devra conserver les intentions et copies locales chiffrées ; aucune
nouvelle copie de texte clair ni UI de brouillon n'est ajoutée au laboratoire.

## 6. Preuves et suite

Linux, Rust 1.99.0, OpenMLS 0.9.0/RustCrypto, versions verrouillées/hors ligne :
**57 fonctions moteur**, dont neuf nouvelles (huit dans
[group_hold.rs](../../prototypes/mls/tests/group_hold.rs), une de contention
dans `lib.rs`), et **3 tests Rust du pont** réussis. Quatre fonctions moteur
pilotent **30 cas de crash de processus**, dont deux nouveaux avant/après
persistance du hold. Ce ne sont pas des coupures électriques.

Tests : blocage avant chiffrement/retry/admission, absence d'écriture d'outbox,
autre groupe, réception, historique, second acteur, restart, masquage Welcome,
Update gagnant sans retrait, retrait réel sans déblocage implicite, candidat
invalide/rollback, garde global prioritaire, panne SQL/retry, migration et
contention d'écriture. Clippy sans avertissement et formatage réussis.

Contrôles documentaires : 88 liens relatifs valides dans huit documents,
20 exigences uniques couvertes par 20 scénarios, références de la revue et des
études cohérentes, TC-303/304/305 toujours « À faire ». `git diff --check` réussi ;
deux verrous de distribution actifs et inchangés. Les neuf modifications
documentaires préexistantes sont préservées et exclues du commit de ce lot.

Commandes : celles du [rapport C1e](TC-302-EPOCH_OUTBOX.md), avec en plus
`cargo test --manifest-path prototypes/mls/Cargo.toml --locked --offline --features interop --test group_hold`.

S08/S10/S12/S13 restent partiels. R01–R08 ouverts ; TC-301 et TC-302 non closes.
Prochaine sous-tâche : **C1g, validateur d'autorité/succession et obligations de
retrait**, en tenant compte de C1f-A1. Pas de déblocage tant que cette preuve
manque ; préparer ensuite Q2 et la reprise après journal expiré.

Aucun audit de dépendances actualisé, libcrux, fuzzing, benchmark, test Dart/UI,
matrice OS, paquet, déploiement ou accès VM/PC. Dernier audit consigné : 11 octobre,
pas une vérification de l'état amont aujourd'hui. Gel, manifestes, lockfiles,
backend et client principal inchangés ; ni fournisseur final sélectionné ni
contrat complet accepté. La question A1 n'empêche pas de tester cet arrêt conservateur.
