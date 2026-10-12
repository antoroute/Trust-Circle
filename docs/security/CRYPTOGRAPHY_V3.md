# Cryptographie V3 — socle de spécification CircleHaven

Version : 0.3 — brouillon intégrant la demande d'historique facultatif, non approuvé pour implémentation
Date : 2026-10-12
Décisions acquises : [ADR-0003](../adr/ADR-0003-protocole-crypto-v3.md),
[ADR-0005](../adr/ADR-0005-confiance-appareil-compte.md),
[périmètre V1](../product/V1_DECISIONS.md), démarrage sans données historiques
État de livraison : [TC-301 reste ouverte et les nouveaux paquets suspendus](../quality/TC-301-SECURITY_HOLD.md)

## 1. Portée et niveau d'autorité

Ce document décrit le contrat visé entre appareils et service, indépendamment
de Rust, Dart, HTTP ou d'une structure de base. Il ne décrit pas une sécurité
déjà fournie par l'application. Les verbes « doit » désignent une exigence de
la cible ; les propositions et points ouverts sont explicitement signalés.
Les décisions du propriétaire et ADR acceptées restent prioritaires.

MLS fournit le protocole de groupe ; CircleHaven doit encore spécifier sa
liaison aux comptes, ses autorisations, sa livraison et son stockage. La
[RFC 9420](https://www.rfc-editor.org/rfc/rfc9420.html) définit le format MLS ;
la [RFC 9750](https://www.rfc-editor.org/rfc/rfc9750.html) décrit les rôles des
services d'authentification et de livraison. Les règles CircleHaven ci-dessous
ne sont pas présentées comme des obligations générales du standard.

Les contrats binaires de TC-303/305 et la politique d'époques de TC-304 restent
à produire. Aucun format inventé pour combler un champ « à définir » ne doit
être intégré au produit. Le laboratoire TC-301 est une preuve partielle, pas
une spécification normative de ces champs.

La [revue contradictoire interne](../quality/TC-302-SPEC_REVIEW.md) examine
huit séquences de panne ou d'abus. Ses constats R01–R08 sont attribués, pas
clos. Les trois questions structurelles R02/R07/R08 exigent une conclusion
de faisabilité et de menace avant acceptation du socle.

### Écarts documentaires identifiés

- L'ADR-0003 et le rapport de décision historique parlent encore de conservation
  du lecteur V2 et de coexistence. La décision ultérieure du propriétaire est
  **aucun compte, conversation, historique ou secret à migrer**. TC-307 devient
  un démarrage V3 à vide et un retrait contrôlé de V2, sans downgrade.
- Certains documents de synthèse locaux indiquent encore « V3 à décider ».
  L'ADR-0003 est acceptée ; ce sont les preuves et l'intégration qui manquent.
- L'invariant 12 emploie « immédiatement » pour la révocation. Il faut distinguer
  la coupure d'accès serveur et la fin d'accès cryptographique après retrait MLS.
  Les instants et la garantie exacte doivent être alignés dans TC-304 ; ce
  brouillon ne diminue pas silencieusement l'invariant.
- « Après approbation » dans les décisions V1 ne définit pas le sort des messages
  entre approbation de compte et ajout au groupe. En réponse à Q1 le 12 octobre,
  le propriétaire demande un partage facultatif d'historique vers appareil
  et personne, si le coût reste raisonnable. L'[ADR-0008 proposée](../adr/ADR-0008-partage-historique-optionnel.md)
  étudie cette extension ; les exclusions historiques de V1 ne valent plus
  refus définitif, mais aucun contrat de partage n'est encore approuvé.

Les modifications locales préexistantes du propriétaire dans ces références
sont préservées. Leur alignement ciblé fait partie de la revue avant acceptation,
pas d'une restauration automatique de fichiers Git.

## 2. Entités et frontières de confiance

| Entité | Sens dans le contrat cible |
|---|---|
| Compte | Identité produit ; une session authentifiée n'est pas une clé MLS |
| Appareil | Installation liée à un compte, avec identité approuvée et clés privées locales |
| Cercle | Périmètre d'appartenance et de rôles ; ce n'est pas un secret de groupe unique |
| Conversation | Principale ou sous-ensemble privé de comptes appartenant au même cercle |
| Groupe MLS | Proposition : un groupe actif par conversation, avec génération distincte après reset |
| Membre MLS | Un appareil de compte admis dans cette conversation, pas le compte entier |
| Époque | Version de l'état cryptographique du groupe, distincte du curseur de livraison |
| Curseur | Position durable du journal serveur, pas preuve cryptographique de fraîcheur |

**V3-001 — Profil imposé.** Utiliser MLS 1.0, suite
`MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519` (`0x0001`), OpenMLS derrière une
façade native étroite. Les messages applicatifs et les contrôles internes sont
des `PrivateMessage`. `KeyPackage` et `Welcome` conservent leurs formats MLS ;
ne pas les confondre avec un message applicatif privé. Pas de nouvelle primitive,
suite expérimentale, PSK dérivée de V2 ni repli implicite.

**V3-002 — Séparation des conversations.** Le contrat proposé associe chaque
groupe à un seul environnement, cercle, conversation et génération. Un reset
crée une nouvelle identité de groupe. Un appareil membre du cercle mais exclu
d'une conversation privée n'en reçoit aucun secret. Les 256 membres de la
baseline ADR désignent des appareils MLS, pas 256 comptes multi-appareils.

**V3-003 — Autorités distinctes.** Le serveur dérive compte et appareil des
preuves d'accès vérifiées, puis applique les ACL atomiquement. Le destinataire
déduit l'auteur du traitement MLS et de son credential validé, jamais du seul
champ JSON ou d'un nom affiché par le serveur. Le backend conserve les octets
opaques et les métadonnées nécessaires ; il ne possède ni clés MLS privées,
ni état secret de groupe, ni clé de base locale, ni texte clair.

Les clients, le service d'identité et le service de livraison ont des responsabilités
distinctes même s'ils partagent aujourd'hui une infrastructure. TLS et le JWT
ne transforment pas une réponse d'annuaire en preuve de confiance E2EE.

## 3. Identité, admission et historique

### Création d'une conversation

Séquence cible, à compléter par les preuves d'autorisation TC-303/304 :

1. Vérifier le droit de créer la conversation et son rattachement au cercle.
2. Sur l'appareil créateur approuvé, créer un groupe MLS neuf avec identifiant
   généré par CSPRNG et liaison authentifiée au contexte CircleHaven.
3. Persister atomiquement le groupe et l'intention de création ; rendre la
   réservation de conversation côté service idempotente. Un timeout ne doit
   pas créer deux groupes actifs pour la même conversation/génération.
4. Ajouter les appareils autorisés avec leurs KeyPackages validés selon les
   transitions ci-dessous ; publier les Welcome selon l'ordre de la section 6.

La conversation ne doit pas être annoncée prête pour un destinataire tant que
son admission n'est pas acquise. Une création partielle reste visible comme
en attente ; le service ne fabrique pas l'état MLS manquant à la place du client.

**V3-004 — Admission authentifiée.** L'identité de compte/appareil approuvée selon
l'ADR-0005 doit être liée au credential MLS `basic` versionné et à la clé de
signature MLS. Vérifier possession, approbation, compte, appareil, versions,
statut et autorisation de conversation avant addition ou acceptation de Welcome.
Une simple chaîne d'octets `account_id/device_id` dans le credential ne prouve rien.
La transcription, les racines de confiance, la fraîcheur et la protection contre
une vue d'annuaire divergente sont des livrables TC-303/305, pas du code ad hoc.
Ne pas réutiliser silencieusement les signatures de preuve V1 pour cet usage.

**V3-005 — KeyPackage non réutilisable.** Un KeyPackage doit être vérifié, borné,
compatible et non expiré, puis attribué à une seule admission. Proposition V1 :
aucun KeyPackage de secours réutilisable. La réservation serveur concurrente,
l'expiration et le traitement d'un Commit perdant restent à spécifier ; le client
doit aussi empêcher une seconde consommation réussie, même si le serveur ment.
Un échec de stockage avant succès ne doit pas perdre la possibilité de reprendre
le Welcome légitime. Consommation, groupe et suppression des secrets devenus
inutiles doivent former une transition durable. Ne jamais remettre en circulation
un KeyPackage déjà exposé à une admission concurrente sans règle validée.

**V3-006 — Admission et historique explicite.** Approbation du registre,
admission dans un groupe et disponibilité des nouveaux messages sont trois
états différents. Le nouvel appareil n'obtient pas les clés d'anciennes époques.
Le partage d'une copie sélectionnée de l'historique, demandé pour un nouvel
appareil ou une nouvelle personne, exige un contrat séparé (ADR-0008 proposée),
une source autorisée et un nouveau chiffrement, jamais la copie d'un état MLS.
L'application doit distinguer l'attente d'admission du transfert de contenu,
sans annoncer un historique complet quand il est partiel. Autorité décidée le
12 octobre : propriétaire ou administrateur participant à la conversation pour
une nouvelle personne, avec choix de période et événement visible par les
membres ; appareil déjà approuvé pour confirmer un transfert vers son propre
appareil. Le contrat détaillé et sa faisabilité restent ouverts ; aucun import
implicite autorisé.

La récupération totale révoque les anciennes sessions/appareils et crée une
nouvelle identité selon le parcours renforcé de TC-404. Elle ne réactive pas
le bootstrap du premier appareil et ne promet pas de récupérer le passé.

## 4. Contexte authentifié et format

**V3-007 — Contexte vérifié avant usage.** Le contrat doit lier cryptographiquement
version applicative, domaine/environnement, cercle, conversation, génération
de groupe, identifiant de message et type de contenu. L'auteur et l'appareil
doivent correspondre à l'identité MLS validée. La destination est le groupe
authentifié de cette époque, pas une liste de destinataires fournie en clair
par le serveur. Les horodatages applicatifs utilisés sont authentifiés mais
ne remplacent jamais une preuve de fraîcheur ou un compteur anti-rejeu.

TC-305 doit choisir la place exacte de chaque champ : contexte de groupe,
`authenticated_data` MLS ou contenu applicatif chiffré. Cette AAD est authentifiée
mais visible, donc ne doit pas contenir de donnée supposée confidentielle.
Les duplications de routage doivent être comparées au contexte vérifié, avec
rejet des divergences. L'identité du groupe seul ne suffit pas si sa liaison à
la conversation provient uniquement d'une réponse serveur non authentifiée.

**V3-008 — Formats stricts et bornés.** Les objets MLS restent encodés selon la
RFC, pas reconstitués ou resignés en JSON maison. TC-305 fixe le codec canonique
du contenu applicatif et des preuves externes, les versions, domaines, tailles
et vecteurs. Le parseur doit consommer exactement les octets attendus et borner
allocations, structures et travail avant leur traitement. Ne pas désactiver les
règles d'extensibilité MLS en rejetant arbitrairement tout champ inconnu : suivre
le standard, les capacités négociées et les restrictions explicites du profil.

L'allowlist précise des extensions, Proposal, external joins et ReInit est à
geler dans TC-304/305. Une fonction exposée par OpenMLS n'est pas automatiquement
autorisée par CircleHaven. Pas d'activation implicite de fonctions hors profil.

## 5. Envoi, réception et persistance

**V3-009 — Transaction d'envoi.** Pour un groupe prêt à envoyer :

1. Vérifier le compte actif, le contexte et l'absence de transition bloquante.
2. Réserver un identifiant d'opération et vérifier l'idempotence locale.
3. Demander à MLS le message privé ; ne pas manipuler ses nonces ou ratchets.
4. Persister atomiquement état MLS avancé, octets produits, opération et copie
   locale destinée à l'historique, dans le stockage chiffré cible.
5. Seulement après succès durable, remettre les octets au transport.

Un retry reprend exactement les mêmes octets persistés. Réutiliser le même
identifiant avec un autre contenu est un conflit, pas une nouvelle émission.
La présence en outbox ne suffit pas à autoriser une réémission : un Commit
perdant ou une époque devenue interdite doit être traité selon TC-304/502.
Le serveur accepte idempotemment les octets et attribue un curseur ; son ACK
signifie « persisté par le service », pas « lu ou vérifié par tous les pairs ».
La copie locale envoyée est nécessaire pour l'historique : ne pas compter sur
le redéchiffrement ultérieur de son propre PrivateMessage.

**V3-010 — Transaction de réception.** Le destinataire borne et décode les
octets, vérifie MLS et les règles CircleHaven, puis persiste dans une même
transaction état avancé, inbox vérifiée, déduplication et progression durable
admissible. Le texte n'est rendu à l'UI, indexé ou notifié qu'après succès.
Une erreur ne publie ni texte partiel ni état « vérifié ». L'invariant 16 impose
la vérification avant usage du clair, pas l'impossible vérification de la signature
interne d'un message MLS privé avant tout déchiffrement interne par la bibliothèque.

**V3-011 — Reprise sans état fantôme.** Une panne avant commit local annule la
mutation ; une panne après commit reprend l'outbox/inbox durable sans rechiffrer
une opération réussie. Aucun objet de groupe modifié ne survit à un rollback
de transaction. Sérialiser les opérations d'un groupe, y compris en cas de
deux processus ou d'un réveil concurrent de l'application.

L'envoi peut afficher une bulle locale « en attente », clairement distincte
de « livré ». Ce brouillon ne choisit pas encore si un brouillon hors ligne
est chiffré immédiatement ou au rattrapage d'époque : Q2/TC-304/TC-502.

## 6. Changements d'époque et concurrence

**V3-012 — Préparation et arbitrage.** La cible conserve un ordre fort des
Commit par groupe et époque source, conformément à l'ADR-0003 :

1. L'auteur valide la politique de changement puis prépare un Commit pending,
   son éventuel Welcome et l'outbox dans une transaction locale.
2. Le service vérifie accès, bornes, idempotence et précondition d'époque ; un
   seul candidat est retenu dans son journal pour cette époque source.
3. L'auteur attend le retour ordonné des octets exacts persistés avant fusion
   définitive ; les pairs vérifient cryptographie et autorisation avant fusion.
4. Le Welcome n'est délivré comme admission réussie que pour le candidat retenu.
   La nouvelle identité de groupe et les preuves d'admission sont vérifiées
   par le nouvel appareil ; un Welcome ne doit pas l'introduire dans une branche perdante.

Le service ne peut pas garantir la validité cryptographique d'un Commit privé
qu'il ne déchiffre pas. Son acceptation de transport n'est pas une validation
MLS. La position d'un candidat ordonné, la transition validée localement et
la disponibilité du groupe sont trois états distincts. Un compteur serveur
incrémenté ne constitue pas une preuve d'époque pour les clients. Un candidat
invalide, un serveur qui présente deux branches ou une liaison
Welcome/Commit falsifiée exigent un arrêt sûr et une reprise définie ; leur
traitement détaillé est un **blocage de spécification TC-304/310**. Ne pas
modifier aveuglément l'époque ni demander au serveur les clés pour résoudre ce cas.
L'arbitrage et le couplage Welcome sont discutés dans la
[RFC 9750, §5.2](https://www.rfc-editor.org/rfc/rfc9750.html#section-5.2).

**V3-013 — Pending, pertes et conflits.** Un timeout de transport laisse le
résultat indéterminé ; interroger/reprendre l'opération, sans déclarer l'échec
définitif ni créer une seconde admission. Si un autre Commit valide gagne,
annuler l'état pending perdant selon l'API MLS, invalider son Welcome et sa
possibilité d'émission, puis réévaluer l'intention initiale sur l'état courant.
Ne pas réenvoyer un ancien ciphertext comme s'il appartenait à la nouvelle époque.
Ne pas ressusciter des secrets supprimés ni fusionner deux branches à la main.

L'écho exact local protège contre une substitution de ciphertext local ; il ne
prouve ni la livraison aux pairs ni l'honnêteté du serveur. L'erreur OpenMLS
`OwnPrivateMessage` seule n'est jamais une authentification. Le protocole
anti-équivocation et la vérification de la position de l'écho restent à définir.

**V3-014 — Révocation à deux niveaux.** Le service coupe l'accès de l'appareil
révoqué et invalide ses offres de clés ; les clients doivent ensuite appliquer
son retrait MLS dans chaque groupe concerné, ou celui de tous les appareils
d'un compte retiré du cercle. Un client informé d'un retrait requis ne doit
pas continuer les nouveaux envois sur une époque qui inclut encore l'appareil.
La mise à jour doit être prioritaire et son attente visible, pas silencieuse.

Un appareil déjà hors ligne ne connaît pas instantanément une révocation.
La politique de fraîcheur et la barrière d'envoi/reprise doivent être conçues
dans TC-304/310 avec les ACL et les changements de rôles. Bloquer le transport
ne fait pas oublier les secrets déjà détenus : un serveur malveillant qui livre
des ciphertexts d'une ancienne époque peut encore exposer ceux-ci à un ancien
membre. Aucune promesse d'effacement distant ni de révocation rétroactive.

## 7. Hors ligne, resynchronisation et erreurs

**V3-015 — Journal et lots.** Retrouver les changements manquants dans l'ordre
avant de traiter un message d'époque future. Les lots sont bornés, interrompus
aux changements de groupe/époque et atomiques à leur niveau. Un trou dans le
journal ne doit pas être masqué en avançant le curseur de succès. Une séparation
entre « reçu » et « traité/vérifié » peut être nécessaire dans TC-504.

Un ciphertext applicatif invalide ne doit ni produire de clair ni bloquer par
retries infinis tous les messages suivants. TC-309/504 doivent définir une
quarantaine bornée et un état d'échec durable ; un Commit invalide ne peut pas
simplement être sauté pour prétendre avoir atteint l'époque suivante.
Un duplicata exact déjà traité, un identifiant en conflit et un objet non
authentifiable sont distingués. Une étiquette « doublon » du serveur n'autorise
pas à supprimer un message sans contrôle. Un traitement par sous-lots repart
de l'état durable après rollback, jamais d'un ratchet partiellement avancé.

**V3-016 — Historique et secrets distincts.** La rétention serveur de 90 jours
porte sur les enveloppes applicatives, pas une conservation automatique de
90 jours de secrets MLS. L'historique local déjà vérifié est conservé chiffré
selon le choix produit ; la forward secrecy ne protège pas cette copie sur un
appareil ultérieurement déverrouillé ou compromis.

TC-304 doit fixer la tolérance inter-époques/hors ordre, la suppression des
secrets, la durée de disponibilité des contrôles et le comportement après
expiration du journal. `max_past_epochs=0` du laboratoire n'est **pas** une
décision produit. Un appareil absent peut avoir besoin de traiter des messages
avant de supprimer l'époque qui les permet ; le test de coupure doit inclure
un changement de membres pendant son absence. Perdre un maillon exige un état
de resynchronisation explicite, jamais un téléchargement de secrets par le serveur.

| Situation | Comportement cible à exposer |
|---|---|
| Réseau absent | Conserver l'intention/envoi durable, montrer l'attente, reprise bornée |
| Époque future ou état incomplet | Rattraper les contrôles, ne pas afficher le contenu non vérifié |
| Admission non terminée | Montrer les conversations en cours d'activation, sans faux historique complet |
| Auteur/contexte/tag invalide | État de sécurité générique, aucun clair ; diagnostic local assaini |
| Identifiant rejoué avec contenu différent | Refus explicite, aucun nouvel effet |
| Stockage plein ou clé OS inaccessible | Refus sûr, aucun succès simulé ; conserver les données récupérables |
| Révocation ou Commit concurrent | Suspendre l'envoi concerné, synchroniser puis réévaluer |
| Journal expiré ou ancien état restauré | Reprise définie ou réadmission explicite, jamais reset silencieux |

Les détails d'erreur externes ne doivent pas révéler les identités, clés ou
conversations auxquelles le demandeur n'a pas droit. Les codes API/FFI restent
à spécifier ; ce tableau n'est pas leur contrat filaire.

## 8. Stockage, réactivité et limites

**V3-017 — Protection locale.** État MLS, outbox, inbox, brouillons et historique
sont chiffrés au repos ; la clé de base est protégée séparément par l'OS et
isolée par environnement/compte/appareil. Les journaux de base, sauvegardes,
fichiers temporaires, notifications et rapports de crash sont inclus dans
l'analyse de TC-306. Un simple arrêt brutal testé sur SQLite ne démontre ni
résistance à une coupure électrique ni détection de restauration d'ancien disque.
L'ancrage anti-rollback reste à concevoir ; ne pas prétendre qu'un compteur
dans la même base suffit. La suppression logique n'est pas une preuve
d'effacement physique de tous les secrets sur SSD.
La fraîcheur de l'état d'envoi doit être établie avant de chiffrer à nouveau
après restauration, pas seulement avant l'upload. TC-306 doit définir les
hypothèses de restauration/compromission locale et les preuves propres à chaque OS.

**V3-018 — Chemin courant asynchrone.** Moteur natif durable, traitement
sérialisé par groupe, files bornées et backpressure. Aucun calcul lourd sur le
thread UI ni consultation d'annuaire supplémentaire par message avec état
chaud et confiance déjà validée. Les événements de sécurité et états inconnus
peuvent imposer une resynchronisation ; l'objectif de fluidité ne permet pas
d'ignorer un doute d'identité ou de diminuer la durabilité du stockage.

Ne pas charger tous les groupes à la connexion. Précharger les groupes récents
et charger les autres à la demande. Un moteur durable n'implique pas de garder
tous les états de groupe déchiffrés en mémoire. Le laboratoire recharge encore
le groupe par transaction ; le cache sûr reste à concevoir et à mesurer.

Budgets hérités : p95 ≤100 ms à chaud, ≤250 ms avec chargement local et <5 s
pour 100 messages repris. Séparer réseau, stockage, FFI et traitement ; comparer
V2/V3 sur le même environnement. Ne pas présenter un temps de roundtrip synthétique
comme délai d'affichage réel ni un premier échange comme démarrage à froid OS.
Mesurer aussi frames, mémoire, batterie et taille ; aucune de ces portes n'est
close par ce brouillon. Voir [les limites C1](../quality/TC-301-MEASUREMENTS.md).

Les bornes de laboratoire sont 16 Kio de texte, 1 Mio d'enveloppe, 100 messages
et 1 Mio par lot, 256 appareils. Seul le plafond de membres est une baseline
de l'ADR, elle-même à confirmer. TC-305 doit justifier les limites produit et
leurs bornes cumulées, vérifier les groupes pleins/clairsemés, les Welcome et
les allocations avant de figer un contrat. Pas de copies illimitées en FFI.

**V3-019 — Surface observable.** Push génériques, logs/métriques sans contenu,
clé, jeton ni dump d'état MLS. Documenter les métadonnées visibles : comptes,
appareils, appartenances, groupe, époque, tailles, horaires et adresses réseau.
Une signature de Commit ne rend pas forcément un événement de sécurité visible
si le serveur le retient ; le journal UI n'est pas une transparence des clés.

**V3-020 — Livraison et démarrage à vide.** Pas de migration V2, conversion
serveur, export/import d'anciens secrets ou lecteur historique obligatoire.
TC-307 doit planifier des groupes neufs, refus des écritures V2 et reset
strictement limité à l'environnement autorisé. Un rollback ne doit pas rouvrir
V2 : il peut bloquer les envois jusqu'à une reprise sûre. Les migrations de
schéma nécessaires restent versionnées, même sans données produit à conserver.

La suspension TC-301 reste prioritaire : pas de nouveau paquet, fork, changement
de fournisseur ou ignore audit. Le choix du fournisseur final, les licences
transitives, les notices, la provenance et les preuves des plateformes restent
des portes de livraison. Aucune revendication publique FS/PCS avant TC-312.

## 9. Preuves et traçabilité

Les scénarios ci-dessous sont des **critères à tester**, pas une suite déjà
exécutée. « Partiel labo » désigne le comportement synthétique déjà couvert
dans [lifecycle.rs](../../prototypes/mls/tests/lifecycle.rs),
[crash.rs](../../prototypes/mls/tests/crash.rs),
[interop.rs](../../prototypes/mls/tests/interop.rs) ou les rapports TC-301.
La référence des essais historiques C1 est `27ab9c6`. Aucune nouvelle exécution
runtime n'accompagne cette préparation documentaire.

| Scénario | Exigences | Invariants | Résultat à démontrer / preuve manquante | Tâche |
|---|---|---|---|---|
| S01 — profil/downgrade | V3-001, V3-020 | 15, 20, 27 | Version/suite/format refusés sans fallback ; partiel labo | TC-305/309/307 |
| S02 — mauvaise conversation | V3-002, V3-007 | 6, 15, 16 | Même cercle mais autre conversation, environnement ou génération : rejet sans clair | TC-305/309 |
| S03 — faux auteur | V3-003, V3-004 | 1, 10, 16 | JWT, routage et credential contradictoires : aucun auteur usurpé | TC-303/310 |
| S04 — appareil fantôme | V3-004 | 10, 11 | KeyPackage valide cryptographiquement mais identité non approuvée : refus | TC-303/309 |
| S05 — Welcome concurrent | V3-005, V3-012 | 7, 10 | Réservation concurrente, Welcome perdant/rejoué/expiré : aucune double admission ; partiel labo | TC-304/310 |
| S06 — nouvel appareil/personne | V3-006 | 10, 13, 16, 25 | Pas de clés anciennes ni d'import implicite ; partage demandé à spécifier selon ADR-0008, provenance distincte et admission visible | TC-303/311 |
| S07 — entrée hostile | V3-008 | 14, 15 | Limites, extensions, longueurs, octets résiduels : pas de panic ni allocation non bornée ; partiel labo | TC-305/309 |
| S08 — retry d'envoi | V3-009 | 21 | Même opération et restart : octets identiques ; autre contenu : conflit ; partiel labo | TC-501/502 |
| S09 — clair non authentifié | V3-010 | 16, 17, 18 | Altération ou erreur SQL : aucun affichage/index/push et aucun ratchet partiel ; partiel labo | TC-309/311 |
| S10 — crash et deux acteurs | V3-011 | 21, 23 | Avant/après transaction et écrivains concurrents : état/outbox/inbox cohérents ; crash partiel labo | TC-306/309 |
| S11 — faux écho local | V3-012, V3-013 | 15, 16 | OwnPrivateMessage ou octets modifiés ne fusionnent pas ; écho exact seul ne prouve pas la position ; partiel labo | TC-304/310 |
| S12 — Commit perdant/invalide | V3-012, V3-013 | 7, 21, 22 | Pas de Welcome orphelin, ciphertext perdant réémis ni saut d'époque ; partiel labo | TC-304/310 |
| S13 — retrait hors ligne | V3-014 | 10, 12 | Coupure serveur + retrait MLS ; absence d'accès au futur démontrée avec timing explicite ; partiel labo | TC-304/310 |
| S14 — reconnexion multi-époques | V3-015, V3-016 | 21, 22, 25 | Ajout/retrait pendant l'absence, message retardé et journal expiré : reprise ou erreur explicite | TC-304/504 |
| S15 — lot empoisonné | V3-010, V3-015 | 16, 21, 22 | Pas de clair partiel, boucle infinie ou saut de Commit ; atomicité partielle labo | TC-309/504 |
| S16 — base copiée/ancien disque | V3-011, V3-017 | 11, 13, 23 | Changement de compte, clé OS perdue, ancien snapshot : pas de fuite croisée ni faux anti-rollback | TC-306 |
| S17 — fluidité | V3-018 | 8, 21 | Réseau additionnel nul à chaud, p95 et reprise sous budgets sur cibles ; mesures C1 non acceptées | TC-301/311 |
| S18 — métadonnées | V3-019 | 18, 19, 30 | Inspection logs, push, crash et stockage : aucune donnée sensible indue | TC-311/509/803 |
| S19 — reset/rollback | V3-020 | 24, 27, 28 | Reset cible vérifiée, ancien client rejeté, aucun retour V2 silencieux | TC-307 |
| S20 — contrôle de livraison | V3-020 | 20, 27 | Audits, licences, provenance, plateformes et suspension respectés ; aucun paquet publié pendant le gel | TC-301/312/805 |

## 10. Points ouverts et prochaine revue

| Question | Décision reçue ou proposition à évaluer | Responsable / blocage |
|---|---|---|
| Q1 — accès et partage facultatif | Partage facultatif demandé si coût raisonnable ; autorité décidée : propriétaire/admin participant, période choisie et événement visible ; appareil déjà approuvé pour son propre appareil. Copie sélective proposée, pas d'anciennes clés | ADR-0008 proposée ; contrat détaillé, faisabilité et inclusion V1 à valider |
| Q2 — durée hors ligne et anciennes époques | Favoriser le rattrapage ordonné, avec rétention de secrets strictement bornée ; pas de chiffre choisi sans mesure/menace | Produit + TC-304 ; bloque politique FS/reprise |
| Q3 — retrait et changement de membres | Mise à jour automatique avec état visible ; aucun nouvel envoi sur état connu obsolète ; préciser le cas dernier appareil disponible | Produit + TC-304/310 ; bloque garantie de révocation |
| Q4 — confiance contre serveur compromis | Définir ancrage initial, preuves d'appareils et solution de détection d'équivoque ; QR manuel seul ne vaut pas transparence automatique | Sécurité + propriétaire, TC-303 ; bloque revendication forte |
| Q5 — perte d'état ou journal expiré | Réadmission explicite sans promesse de messages perdus, conservation sûre de l'historique local déjà vérifié | Produit + TC-304/306/404 ; bloque récupération silencieuse |

Restent également les paramètres techniques : codecs/domaines/limites
(TC-305), cache et stockage/anti-rollback (TC-306), gestion du Commit privé
invalide et preuve d'autorisation des changements de rôles (TC-304/310).
Le fait qu'un membre MLS puisse signer ne prouve pas qu'il est administrateur
CircleHaven ; la validation des changements doit couvrir les deux niveaux.

La revue **TC-302 lot B** est consignée, avec huit constats encore ouverts et
les fiches TC-303/304/305 préparées. Prochaine action : **TC-302 C1**, étude de
faisabilité ciblée R02/R07/R08 et décisions reçues. La rédaction ne remplace ni TC-301 C2 ni une revue
cryptographique indépendante. Ce document ne doit pas être déclaré final tant
que les dépendances et la revue de la fiche TC-302 restent ouvertes.
