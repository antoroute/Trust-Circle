# TC-302 — Spécification indépendante du protocole V3

Statut : En cours — A/B et C1/C1b documentés, C1c–C1f testés dans le laboratoire ; contrat et preuves ouverts, clôture bloquée par TC-301
Priorité : critique avant intégration
Date : 2026-10-23
Responsable de décision : propriétaire du produit pour les compromis UX ; revue sécurité pour le contrat
Dépendances : ADR-0003 acceptée, ADR-0005, TC-301 pour la clôture

## Contexte et autorisation de travail

Le propriétaire demande de passer à l'étape suivante, sans lever sa décision
de suspendre les nouveaux paquets. La préparation de la spécification peut
avancer indépendamment de la disponibilité du fournisseur crypto. Cela ne
clôture pas TC-301, n'autorise pas de nouveaux paquets et ne lance pas TC-310/311.
Lire [la suspension](../quality/TC-301-SECURITY_HOLD.md).

Le 17 octobre, la demande « continue en mettant en place », suivie de
« continue », étend ce périmètre à une première preuve exécutable locale :
**C1c, garde de restauration dans le laboratoire natif existant**, sans
intégration produit, nouvelle dépendance ou distribution. Elle remplace la
restriction documentaire pour ce lot borné, pas les autres portes de validation.

La continuation du 18 octobre réalise **C1d, Welcome différé et invalidation
locale du pending perdant** dans le même laboratoire, avec adaptation minimale
du consommateur Rust du pont de test Flutter. Aucune intégration produit.

La continuation validée le 23 octobre réalise **C1e, invalidation atomique des
anciennes sorties applicatives après fusion MLS**, dans le même laboratoire.
Les contrôles historiques sont conservés pour le rattrapage. Les contre-tests
précisent les conditions nécessaires de reprise, sans implémenter la barrière Q3.

La poursuite C1f du 23 octobre propose les sources/portées de révocation et
ajoute un arrêt ciblé synthétique avant fusion. Ni validation d'autorité, ni
reprise automatique, ni intégration produit. L'exécutant d'un retrait prouvé
fait l'objet de la question C1f-A1, distincte de l'attente Q3 déjà acceptée.

Le laboratoire ne constitue pas la spécification produit : identités
synthétiques, SQLite non chiffré, transport simulé et absence de politique
hors ligne complète. Le transformer directement en moteur de production
laisserait ces lacunes implicites.

## Objectif mesurable

Produire [CRYPTOGRAPHY_V3.md](../security/CRYPTOGRAPHY_V3.md), lisible sans
connaître Rust ou Flutter, avec frontières de confiance, exigences numérotées,
séquences, erreurs, preuves attendues et décisions ouvertes attribuées.
Chaque exigence doit distinguer décision acquise, proposition et preuve réelle.

La spécification décrit l'intégration de MLS, pas de nouvelles primitives.
Les formats octet par octet et les politiques détaillées seront affinés dans
TC-303 à TC-305, puis intégrés sans changer silencieusement ce socle.

## Hors périmètre

- Changer de protocole, de suite ou de fournisseur, contourner l'audit.
- Modifier dépendances, lockfiles, paquets ou pipelines de distribution.
- Implémenter MLS dans le client principal ou de nouvelles routes backend.
- Modifier la VM, les règles réseau ou rouvrir l'accès au PC du propriétaire.
- Migrer comptes, conversations, historiques ou secrets V2 : aucun à conserver.
- Déclarer validés les budgets, le chiffrement au repos ou une protection contre
  un serveur d'identité compromis.

## Lots et ordre de travail

1. **A — socle documentaire (réalisé)** : vocabulaire, frontières, profil MLS,
   transactions, synchronisation, menace et matrice d'acceptation ; corriger
   TC-307 dans la roadmap pour refléter un démarrage à vide.
2. **B — revue contradictoire du contrat (réalisée, constats ouverts)** : parcourir les scénarios de perte
   réseau, appareil révoqué hors ligne, Commit concurrent/invalide et Welcome
   prématuré ; préparer les choix produit nécessaires et les fiches TC-303/304/305.
   Travail documentaire possible pendant la suspension, pas validation runtime.
3. **C — stabilisation du socle** : C1, étude de faisabilité R02/R07/R08 et
   arbitrages reçus, possible sous forme documentaire pendant la suspension ;
   C2, incorporer les conclusions TC-301 après levée de la suspension et preuves
   manquantes, aligner les références et accepter le contrat de base avant implémentation.

TC-303/304/305 approfondissent ensuite le socle accepté. Leurs détails ne sont
pas présentés comme déjà résolus par TC-302 ; la spécification finale reste
évolutive jusqu'à ces compléments et à l'audit TC-312.

## Critères d'acceptation

- [x] Socle rédigé (v0.1 puis v0.2), explicitement non approuvé et non implémenté.
- [x] Standard MLS séparé des règles CircleHaven et du comportement du laboratoire.
- [x] Relations compte/appareil/cercle/conversation/groupe et frontière serveur définies.
- [x] Création, ajout, retrait, message, reprise et échecs décrits au niveau contractuel.
- [x] Exigences de persistance, authenticité et performance reliées à des scénarios.
- [x] Absence de migration V2 et interdiction de downgrade consignées.
- [x] Décisions ouvertes et écarts avec les anciens documents attribués.
- [x] Revue contradictoire interne du lot B consignée : huit constats attribués, non clos.
- [x] Première comparaison de faisabilité R02/R07/R08 sourcée, avec limites et cas de preuve ; aucune résolution définitive déduite.
- [x] C1b consigné : référent et périmètre de restauration décidés, admission approfondie, huit cas supplémentaires à prouver.
- [x] C1c : garde local après signal de restauration et rollback d'admission éprouvés ; G06/G07/G08 partiels, sans fermeture de R07.
- [x] C1d : Welcome différé et perdant invalidé atomiquement ; G04/G05 partiels et contre-exemple de divergence, sans fermeture de R02/R03.
- [x] C1e : anciennes sorties applicatives invalidées avec la fusion ; S08/S10/S13 partiels, contre-exemples époque/retrait, Welcome ancien et indice réutilisé, sans fermeture de constat.
- [x] C1f : source/portée proposées et arrêt ciblé testé avant fusion ; pas d'authentificateur ni d'unlock ; S08/S10/S12/S13 partiels, aucun constat fermé.
- [ ] Faisabilité et hypothèses des bloqueurs structurels R02/R07/R08 établies avant acceptation du socle.
- [ ] TC-301 close avec fournisseur, dépendances et budgets étayés.
- [ ] Socle accepté et références documentaires alignées, sans écraser les modifications du propriétaire.

## Plan de validation

- Vérification documentaire : liens relatifs, identifiants d'exigences/scénarios,
  cohérence roadmap/fiche/prompt, absence de promesse de sécurité non prouvée.
- Relecture des ADR, décisions V1, invariants et des fonctions/tests du
  laboratoire concernés ; les preuves existantes ne sont citées que dans leur périmètre.
- `git diff --check` ; changements documentaires pour A/B/C1/C1b ; code et tests
  synthétiques limités au laboratoire pour C1c–C1f, consommateur Rust du pont compris.
- Ne pas relancer les matrices CI, compiler de paquets ou déclencher un déploiement
  pour ces lots. Les preuves partielles exécutées en C1c–C1f sont distinguées des
  autres tests de la matrice, toujours **à écrire**.

### Contrôles du lot A

Le 12 octobre (heure de Paris) : 118 liens relatifs vérifiés dans les documents
du lot et leurs index ; 20 identifiants d'exigences uniques, tous couverts par
les 20 scénarios ; cinq questions produit identifiées. `git diff --check`
réussi. Les deux verrous de distribution restent activés et inchangés.
Aucun test runtime, build, appel à la VM ou essai sur appareil n'est effectué
dans ce lot documentaire. Ces contrôles ne constituent pas une revue crypto.

### Lot B — revue interne

Le [rapport](../quality/TC-302-SPEC_REVIEW.md) suit huit séquences d'événements,
distingue panne réseau, membre hostile et serveur compromis, et attribue chaque
constat à des exigences/scénarios et une tâche. Le socle v0.2 précise l'autorité
limitée de l'ACK, la réémission conditionnelle de l'outbox, le traitement d'un
lot hostile et la fraîcheur de l'état avant chiffrement après restauration.

Les fiches TC-303/304/305 sont préparées avec critères et preuves, statut « À
faire ». À l'issue de cette revue, aucune décision Q1–Q5 n'était présumée
acceptée ; les réponses ultérieures sont consignées ci-dessous. Le lot B
n'est pas un audit indépendant ni un test runtime.

Réponse à Q1 reçue le 12 octobre : partage d'historique facultatif souhaité
vers un nouvel appareil et une nouvelle personne, si les ressources et la
complexité restent raisonnables. L'[ADR-0008 proposée](../adr/ADR-0008-partage-historique-optionnel.md)
enregistre ce besoin, les limites et un découpage conditionnel ; le socle passe
en v0.3. Ce n'est pas un accord à la restriction aux seuls messages futurs.
Arbitrage complémentaire reçu le 12 octobre : le partage vers une nouvelle
personne sera autorisé par le propriétaire ou un administrateur participant à
la conversation, avec choix de la période et événement visible par les membres.
Le transfert vers son propre appareil sera confirmé depuis un appareil déjà
approuvé. Ne pas redemander cet arbitrage. Contrat détaillé, faisabilité et
inclusion V1 restent à confirmer ; l'ADR demeure proposée pour ces aspects.
Les anciennes preuves du lot B n'incluent pas ce nouveau périmètre.

Contrôles documentaires : 139 liens relatifs valides, 20 exigences et 20
scénarios cohérents, huit constats reliés à ces identifiants et trois fiches
maintenues au statut « À faire ». `git diff --check` réussi ; deux verrous de
distribution toujours actifs. Aucun test applicatif ou multiplateforme relancé,
car seuls des documents changent ; aucune propriété crypto nouvelle n'est prouvée.

### C1 — première étude de faisabilité

Le [rapport C1](../security/V3_FEASIBILITY_STUDY.md) confronte RFC 9420/9750,
OpenMLS local verrouillé, documentation OS et composants de transparence.
Le socle v0.4 intègre ces précisions, toujours sans autorisation d'implémentation.

- R02 : journal ordonné de candidats recommandé pour éviter le verrou SQL
  prématuré ; hypothèses et limites de fragmentation explicites. Couplage
  Welcome/arbitrage et barrière de retrait encore à démontrer.
- R07 : `reuse_guard` standard confirmé par lecture du code ; comparaison
  crash/base seule/image complète, limites OS et contre-exemples aux témoins
  insuffisants. Aucun mécanisme universel ni restriction de menace accepté.
- R08 : vérification initiale obligatoire acceptée, consignée le 17 octobre
  dans l'[ADR-0009](../adr/ADR-0009-verification-identite-initiale.md). Contrat de
  groupe et équivoque encore ouverts ; AKD, Signal KT et dépôt Google comparés
  sans installation ni sélection définitive.
- F01–F10 : cas de validation supplémentaires reliés aux scénarios existants.

Aucun des constats R01–R08 n'est clos. Ne pas redemander les arbitrages reçus
sur l'autorité de partage Q1 ou l'UX initiale Q4. Les licences de composants
examinées ne valent pas validation juridique
de l'application sur les stores.

Les preuves de nonce, rollback, charge, batterie, OS et intégration restent
à produire : cette passe n'exécute que des contrôles documentaires. Pas de
nouvel audit de dépendances ou CI, ni modification de lockfile, code, paquet,
VM ou accès PC. La suspension de distribution reste inchangée.

Contrôles C1 actualisés le 17 octobre : 70 liens relatifs existants dans les
douze documents concernés,
20 exigences uniques couvertes par 20 scénarios, dix cas F01–F10 reliés aux
scénarios connus, trois fiches suivantes toujours « À faire ». `git diff --check`
réussi ; deux verrous actifs et inchangés ; changements documentaires uniquement.

### C1b — admission, référent et restauration

Le [rapport C1b](../security/V3_ADMISSION_RECOVERY_STUDY.md) approfondit les
contrats sans code produit. Deux réponses explicites sont consignées le 17 octobre :

- [ADR-0010](../adr/ADR-0010-referent-identite-groupes.md) : délégation au
  propriétaire/admin référent vérifié, attestations d'identités personnellement
  vérifiées, distinction UI et risque du référent compromis/trompé.
- [ADR-0011](../adr/ADR-0011-perimetre-restauration-v1.md) : crash courant repris,
  état actif exclu des backups ordinaires, restauration détectée suivie de
  réactivation avec historique lisible préservé, images complètes sans garantie
  de détection. Périmètre accepté, pas une preuve de protection réalisée.

La libération du Welcome après fusion locale durable est proposée ; elle ne
ferme pas R02/R03 face à un auteur hostile ou au DS divergent. La consommation
précoce de KeyPackage par OpenMLS impose une transaction couvrant traitement
et contrôles applicatifs. Huit cas G01–G08 précisent les preuves à écrire.
Le socle devient v0.5 ; aucun constat n'est fermé et les fiches suivantes
restent « À faire ».

Lecture de sources, pas tests runtime : l'archive OpenMLS 0.9.0 déjà en cache
a le SHA-256 attendu par Cargo.lock ; cinq sources inspectées sont identiques
à leur contenu dans cette archive, sans extraction sur disque. Cela ne vaut
ni audit, ni validation d'un appel API exécuté. Les garde-fous de distribution
restent inchangés ; aucune dépendance ou infrastructure modifiée.

Contrôles C1b : 89 liens relatifs valides dans 15 documents, 20 exigences
uniques couvertes par 20 scénarios, dix cas F et huit cas G reliés aux scénarios
connus. Trois fiches suivantes toujours « À faire », deux verrous de distribution
actifs et inchangés, `git diff --check` réussi. Aucun test applicatif, benchmark,
audit de dépendances, CI ou essai matériel relancé : ce lot ne modifie que des
documents et ne lève pas la suspension. Ces contrôles ne prouvent pas la sécurité.

### C1c — première mise en place locale

Le [rapport C1c](../quality/TC-302-RECOVERY_GUARD.md) décrit le garde durable,
son schéma versionné et ses limites. Après signal externe, le moteur bloque
les mutations MLS et la relecture de l'outbox, sans effacer l'inbox validée.
Il ne détecte pas les restaurations et ne sait pas encore réactiver un appareil.
Le contrôle ajoute une lecture SQL locale dans la transaction existante, pas
un aller-retour réseau. Aucun budget de performance nouveau n'est déclaré validé.

Trente fonctions de test Rust réussies sur Linux/RustCrypto, dont dix nouvelles
et un test pilotant vingt cas de crash ; interopérabilité mls-rs conservée.
Les trois tests Rust du pont Flutter réussissent aussi. Clippy et formatage
réussis. G06 prouvé dans le contexte synthétique ; G07/G08 partiels, avec
contre-exemple explicite au marqueur restauré avec la base.
Les détecteurs OS, le chiffrement au repos, la réadmission et l'annulation
réseau restent à implémenter. Aucun constat de la revue n'est clos.

### C1d — Welcome différé et invalidation locale

Le [rapport C1d](../quality/TC-302-ADMISSION_RELEASE.md) décrit les états durables
de l'outbox : Welcome masqué tant que le Commit est pending, accessible après
fusion locale durable, sortie perdante invalidée avec trace d'idempotence.
Une erreur SQL annule ensemble fusion et changement de disposition. Les bases
synthétiques anciennes avec outbox/pending sont bloquées conservativement ;
leur inbox n'est pas effacée. Schéma v3, sans migration de données produit.

Huit nouveaux tests portent le total moteur à **38 fonctions réussies**, dont
deux pilotent **24 cas de crash**. Les trois tests Rust du pont réussissent ;
interopérabilité, Clippy et formatage passent. Les participants rejoints
incluent désormais l'arbre standard lorsqu'ils créent un Welcome à leur tour,
avec test de régression. Aucun benchmark, audit actualisé ou essai OS relancé.

G04 est partiellement couvert localement, pas le transport/ACK. G05 comprend
un contre-exemple exécuté : deux auteurs fusionnent des branches divergentes
et libèrent chacun un Welcome. Aucune garantie de consensus ou détection de
fork déduite. L'[ADR-0012](../adr/ADR-0012-livraison-admission-v3.md) prépare
l'addendum transport/admission, **proposé** ; aucun constat R01–R08 fermé.

Le 18 octobre, Q3 est acceptée : si aucun appareil habilité ne peut achever
un retrait, les nouveaux envois de la conversation attendent ; lecture locale,
brouillons et autres conversations disponibles. L'attente peut durer jusqu'au
retour d'un appareil habilité. Ce choix n'efface pas les messages déjà reçus,
ne couvre pas une révocation cachée par un serveur compromis et ne prouve
pas encore le mécanisme levant la barrière. Ne pas redemander cet arbitrage.

### C1e — outbox applicative et conditions de retrait

Le [rapport C1e](../quality/TC-302-EPOCH_OUTBOX.md) décrit l'invalidation des
anciennes sorties applicatives dans la transaction de fusion propre/distante.
Les autres groupes et l'inbox restent disponibles ; les contrôles historiques
sont conservés pour le rattrapage. Le schéma v4 bloque les anciennes bases v3
avec sorties applicatives d'époque inconnue, sans enlever un garde existant.
Aucune migration produit ni conservation supplémentaire en clair.

Dix nouveaux tests portent le moteur à **48 fonctions réussies** ; trois
pilotent **28 cas de crash**. Les trois tests Rust du pont, Clippy et formatage
passent. Le test de non-régression a d'abord échoué sur le code précédent.
S08/S10/S13 partiels : atomicité, restart, autre groupe, ancien ciphertext
déjà remis, contrôle historique et refus de retry périmé sont distingués.

Trois contre-exemples précisent l'ADR-0012 : un Update peut gagner sans retirer
la cible, un Welcome valide ouvrir un ancien état et un indice de feuille
désigner un autre appareil. L'époque seule ne peut donc pas lever l'attente.
Le signal authentifié, la cible stable, l'intention durable et le contrôle de
départ restent à concevoir en **C1f** ; pas de barrière Q3 complète ni de
détection de fork. Avant intégration, préserver la copie locale chiffrée du
contenu et réconcilier les ACK inconnus, sans perte silencieuse ni retry aveugle.

Le gel, les dépendances et les lockfiles restent inchangés. Pas de benchmark,
audit actualisé, matrice OS, paquet, VM ou accès PC. Les constats R01–R08 et
la clôture TC-301 restent ouverts. Q3 produit n'est pas à redemander.

### C1f — entrée de confiance proposée et arrêt ciblé

Le [rapport C1f](../quality/TC-302-REVOCATION_SIGNAL.md) distingue indication
serveur, obligation autorisée et transition validée. Le registre V1 contient
une décision signée, mais ses événements ne sont pas une preuve complète V3
pour les pairs. La cible compte/appareil/incarnation, la succession de credentials
et l'autorité antérieure restent à lier dans le validateur, sans réutiliser V1.

Le laboratoire reçoit un signal injecté : blocage durable par groupe des
envois/retries/ajouts, Welcome masqués, réception/contrôles encore possibles,
inbox et autres groupes disponibles. Schéma v5 ; garde global prioritaire.
Aucun déblocage, y compris après un Remove réussi ; il ne connaît pas l'identité
révoquée ou ses permissions. La persistance échouée n'arrête que l'acteur courant
jusqu'au retry ; crash avant commit nécessite un rejeu depuis une source durable.

Neuf nouvelles fonctions : **57 tests moteur**, **3 tests Rust du pont** et
**30 cas de crash** réussis. Clippy et formatage passent. Pas de budget validé,
de paquet, d'audit actualisé, de test UI/OS ou d'accès VM/PC ; gel inchangé.
Question C1f-A1 posée, en attente : exécution d'un retrait déjà prouvé par un
participant autorisé ou seulement par un propriétaire/admin participant.
Ce choix n'accepte pas tout le contrat et ne redemande pas Q3.

## Risques, reset et retour arrière

La principale menace documentaire serait de transformer des hypothèses en
garanties, notamment révocation « immédiate », historique des nouveaux
appareils, ordre serveur et conservation d'anciennes époques. Le socle les
rend explicites et n'autorise aucun contournement des invariants.

Un retour arrière des lots documentaires retire seulement leurs ajouts, par
modification ciblée. Aucun effacement de données ni changement d'environnement
n'est effectué. TC-307 préparera séparément un reset vérifié et borné ; la
décision de repartir à vide n'autorise pas une suppression opportuniste ici.
Pour C1c–C1f, ne pas retirer les marqueurs ni utiliser un ancien binaire sur une base
devant rester bloquée ; rollback de code uniquement avec de nouvelles fixtures
jetables. Voir le rapport pour la stratégie de schéma, sans migration descendante.

## Décisions humaines nécessaires

Aucune pour rédiger le lot A. Avant gel des politiques : arbitrer l'UX des
changements de groupe, la durée de fonctionnement hors ligne et les limites de
récupération ; voir les questions Q1–Q5 de la spécification. La suspension reste
une décision explicite en vigueur, pas une option à retirer automatiquement.
L'autorité de partage Q1, la vérification initiale Q4, la délégation au référent
et le périmètre de restauration sont décidés, ainsi que l'attente sécurisée Q3 ;
leurs contrats détaillés ne le sont pas tous. Restent notamment Q2, la preuve
technique de la barrière Q3 et la reprise après journal expiré de Q5,
pas une répétition des choix reçus. Le modèle de menace DS/membre hostile de R02
ne peut être diminué implicitement par l'accord sur les restaurations.
Question C1f-A1 en attente : qui peut exécuter un retrait déjà authentifié et
autorisé, sans pouvoir en décider un ? Voir rapport C1f ; le hook conservateur
testé n'impose aucune réponse et n'est pas une implémentation des rôles.

## Livrables et reprise

- [Socle V3 v0.5](../security/CRYPTOGRAPHY_V3.md).
- [Revue interne du lot B](../quality/TC-302-SPEC_REVIEW.md).
- [Première étude C1 : options, limites et preuves](../security/V3_FEASIBILITY_STUDY.md).
- [Approfondissement C1b : admission et récupération](../security/V3_ADMISSION_RECOVERY_STUDY.md).
- [C1c : implémentation locale, preuves et limites](../quality/TC-302-RECOVERY_GUARD.md).
- [C1d : Welcome différé, invalidation et contre-exemple](../quality/TC-302-ADMISSION_RELEASE.md).
- [C1e : outbox applicative, atomicité et limites de preuve du retrait](../quality/TC-302-EPOCH_OUTBOX.md).
- [C1f : source des révocations et arrêt ciblé](../quality/TC-302-REVOCATION_SIGNAL.md).
- [ADR-0012 proposée : contrat transport et Q3 produit décidée](../adr/ADR-0012-livraison-admission-v3.md).
- [Roadmap corrigée](../roadmap/ROADMAP.md) et index documentaire.
- [Prompt structuré TC-302](../prompts/CONTINUE_TC-302.md).

Prochaine sous-tâche : **TC-302 C1g, validateur d'autorité/succession et obligations
de retrait**, puis hors ligne Q2, sans nouveaux paquets. Tenir compte de C1f-A1 ;
ne pas coder un déblocage sans cible authentifiée ni preuve de reprise.
Ne pas recommencer les études ou redemander les décisions acquises. TC-301 C2 reste
à reprendre selon les conditions de sa suspension, sans être sauté.
