# TC-302 C1b — Admission, référent et reprise

Date : 2026-10-17
Statut : approfondissement documentaire ; décisions produit et propositions séparées
Base : `c4025da`, sources locales OpenMLS `0.9.0`, sans compilation
Suite de : [C1](V3_FEASIBILITY_STUDY.md) et [revue R01–R08](../quality/TC-302-SPEC_REVIEW.md)

## Résultat

- **R08** : délégation explicite au référent acceptée dans l'[ADR-0010](../adr/ADR-0010-referent-identite-groupes.md).
  La politique produit est précisée ; son protocole et la fraîcheur restent ouverts.
- **R02/R03** : séparation entre Welcome préparé, libération après fusion locale
  et activation du destinataire. Observation nouvelle : préparer un Welcome
  avec OpenMLS peut déjà consommer son KeyPackage ; prévoir une transaction.
- **R07** : distinguer reprise normale, restauration détectée et image complète.
  Les contre-exemples excluent une promesse universelle fondée sur le seul disque.
  Le périmètre V1 de récupération est accepté dans l'[ADR-0011](../adr/ADR-0011-perimetre-restauration-v1.md),
  sans prétendre que ses mécanismes ou preuves sont réalisés.

Aucun constat fermé, test crypto exécuté, nouveau paquet ou déploiement.
Les états ci-dessous sont des **propositions de contrat**, pas des noms de
routes, enums FFI ou tables déjà créés.

## 1. Première confiance : identité, rôle et accès distincts

L'ADR-0010 complète l'ADR-0009, sans remplacer la confiance multi-appareil.
La comparaison est faite avec la personne/référent sur un canal fiable ; le
serveur seul ne fournit pas l'ancre. Pour le parcours simple, choisir un même
référent vérifié par chaque membre permet une organisation en étoile. Avec des
référents différents, ne pas supposer que les attestations se rejoignent :
il faut une politique explicitement acceptée et des preuves vérifiables.

| Élément | Ce qu'il autorise dans la cible | Ce qu'il n'autorise pas |
|---|---|---|
| Comparaison directe conservée | Reconnaître cette identité exacte et sa continuité prouvée | Accepter une nouvelle racine depuis le seul annuaire |
| Attestation d'un référent vérifié et autorisé | Reconnaître l'identité attestée dans le périmètre de délégation accepté | S'auto-promouvoir, transmettre automatiquement cette délégation ou contredire un ancrage direct |
| Approbation d'appareil du titulaire | Relier un nouvel appareil à cette identité de compte | Donner accès à toutes les conversations du cercle |
| Admission dans une conversation | Accéder à son époque MLS d'admission et aux suivantes autorisées | Accéder au passé ou à une autre conversation |
| Autorisation de partage ADR-0008 | Copier le contenu disponible et sélectionné aux destinataires autorisés | Copier anciens ratchets/clés ou certifier l'auteur original d'une archive |

Pas de publication de Welcome vers une identité dont la vérification requise
est en attente. Puisqu'un message de groupe s'adresse à toutes ses feuilles,
masquer un membre dans l'interface ne l'exclut pas du chiffrement. Les clients
doivent contrôler le changement de membres avant de fusionner le Commit.
Une attestation par le référent ne doit jamais être affichée comme comparaison
personnelle. La perte du référent ou une preuve contradictoire bloque la nouvelle
admission concernée ; le comportement des groupes existants dépend de l'analyse
de révocation, pas d'un effacement automatique de leur historique.

## 2. Welcome : ce qui peut réellement être prouvé

La [RFC 9420, §12.4.3.1](https://www.rfc-editor.org/rfc/rfc9420.html#section-12.4.3.1)
indique que le nouvel arrivant ne vérifie pas l'ancien Commit depuis son Welcome.
GroupInfo et le tag de confirmation authentifient l'état reçu, pas son choix
par tous les pairs. L'[authentificateur d'époque, §8.7](https://www.rfc-editor.org/rfc/rfc9420.html#section-8.7)
compare des vues dans un protocole secondaire ; il n'est pas à lui seul une
preuve de fraîcheur ou de consensus.

La [RFC 9750, §5.2.3](https://www.rfc-editor.org/rfc/rfc9750.html#section-5.2.3)
demande de coupler Welcome et arbitrage. Le contrat ci-dessous est notre
proposition d'intégration, pas un mécanisme supplémentaire garanti par MLS.

### Proposition : libération en deux temps par l'auteur

| État de l'auteur | Condition / effet durable | Reprise après panne |
|---|---|---|
| Préparé | Commit pending et Welcome conservés localement ; seul le candidat Commit est soumis | Reprendre les mêmes octets et la même opération ; aucun Welcome envoyé |
| Ordre indéterminé | Attendre le préfixe complet et les dépendances ; ACK/timeout ne décide pas | Relire l'opération et les contrôles, pas de deuxième admission |
| Gagnant local | Traiter le préfixe, fusionner son Commit et enregistrer ensemble une outbox de libération | Après commit durable, reprendre la publication du Welcome exact |
| Perdant local | Invalider Welcome et pending perdants ; réévaluer l'intention sur la nouvelle époque | Ne pas publier le Welcome perdant ni recycler son KeyPackage comme disponible |
| Divergence connue | Geler les nouveaux envois concernés et conserver un diagnostic assaini | Pas de fusion, retour d'époque ou external join automatique |

Dans cette proposition, le Welcome n'est **pas préchargé sur le DS** pour être
« débloqué » plus tard : un DS compromis pourrait ignorer ce verrou. Un auteur
honnête ne le transmet qu'après sa fusion locale durable. Cela ajoute une étape
de livraison pour l'admission, pas pour chaque message courant. Si l'auteur
devient indisponible entre fusion et libération, l'admission attend sa reprise ;
un autre appareil n'invente pas les octets ou les secrets manquants. Un timeout
ne suffit pas à autoriser un second ajout du même destinataire.

Portée : ceci traite un auteur honnête et une vue de livraison cohérente.
Un DS qui lui présente un autre préfixe peut encore provoquer une branche
différente. Un auteur hostile peut publier un Welcome avant la fusion, même
avec un serveur honnête ; ses signatures ne prouvent pas qu'il a attendu.
Ne pas affirmer que le seul retard de publication ferme R02/R03.

### Côté nouvel arrivant

Le destinataire doit vérifier contexte attendu, identité de l'auteur,
autorisations, membres et KeyPackage, en plus des contrôles MLS. Une preuve
applicative de libération doit être liée à l'opération, aux octets du Welcome
et à l'état résultant ; un objet JSON signé uniquement par le serveur ne suffit
pas. Le choix du mécanisme, son format et sa fraîcheur restent ouverts.

Comparer un GroupInfo signé par un pair connu peut aider à lier des états,
mais sa signature seule peut être rejouée. Une confirmation du même auteur
ne constitue pas un témoin indépendant ; ajouter un défi change la fraîcheur
de la réponse, pas la sincérité du répondant. Consulter un second pair impose
sa disponibilité et ne prouve pas l'accord de tous. Aucun quorum ni protocole
secondaire maison n'est sélectionné pour combler cette lacune.

Autre limite : une fois livré, un Welcome contient déjà les moyens de rejoindre
son époque. Un badge « en attente » n'empêche pas un destinataire hostile
d'exploiter ces secrets. La sécurité de l'admission doit précéder la remise
du Welcome ; ce n'est pas seulement une règle d'affichage.

### Observation OpenMLS et transaction d'admission

Lecture des sources locales `src/group/mls_group/creation.rs` :
`ProcessedWelcome::new_from_welcome` appelle `keys_for_welcome`, qui supprime
le KeyPackage non réutilisable dans le stockage avant la fin du traitement.
`StagedWelcome::new_from_welcome` le documente ; le nom « staged » ne signifie
donc pas « sans écriture ». Les accesseurs `welcome_sender`, `members` et
`group_context` permettent des contrôles avant `into_group`.

Contrat proposé : bornage/précontrôles sans effet, puis une transaction englobant
traitement Welcome, contrôles applicatifs, consommation du KeyPackage, groupe,
marqueur d'admission et déduplication. Sur échec, annuler les écritures et jeter
les objets secrets en mémoire. Une preuve distante manquante doit être récupérée
hors transaction ; ne pas garder un verrou SQLite pendant une attente réseau.
Un retry légitime après rollback n'est pas une seconde admission réussie.
Une consommation réussie ne doit jamais être annulée pour permettre un rejeu.

Le [laboratoire `join`](../../prototypes/mls/src/lib.rs) englobe déjà le traitement
dans `atomic`, mais vérifie essentiellement groupe/suite/bornes. Il ne valide
pas le futur contrat de référent, de rôles ou de libération. Aucune vulnérabilité
nouvelle du laboratoire n'est déduite de cette lecture.

### Révocation : ne pas confondre admission et barrière

La libération d'un Welcome ne prouve pas la prise en compte d'un retrait.
Conserver une barrière d'autorisation distincte de l'époque MLS : sous serveur
honnête, le retrait doit couper l'accès et bloquer les publications concernées
pendant la transition, sans bloquer les contrôles nécessaires à sa résolution.
Un client informé doit attendre un état authentifié qui exclut l'appareil.
Le signal permettant au serveur opaque de lever sa barrière reste à définir ;
un champ `epoch=e+1` ou un ACK du premier membre ne suffit pas.

Un serveur hostile peut cacher une révocation et transmettre d'anciens
ciphertexts à un ancien membre ; les signatures ne prouvent pas l'absence
d'un événement caché. La première confiance par référent ne ferme pas ce risque.
R02/R04 restent ouverts et l'invariant de révocation doit être aligné explicitement.

## 3. Restauration : décision de périmètre et reprise sûre

### Pourquoi le seul disque ne peut pas décider

Contre-exemple de conception, **pas un test exécuté** : état sauvegardé D0,
chiffrement local d'un message sans publication, puis restauration de D0 avec
son marqueur OS. Le serveur n'a rien observé ; les lectures durables peuvent
être identiques à celles d'un redémarrage sans cet envoi. Aucun comparateur
de ces seuls marqueurs ne peut distinguer les deux histoires. Un nouvel aléa
ou `reuse_guard` ne reconstitue pas l'histoire manquante.

Un état indépendant doit avancer avant l'usage à protéger, ou la reprise doit
abandonner l'ancien état d'envoi. Un témoin sur la même VM restaurée ne fournit
pas cette indépendance. La [reprise MLS après perte d'état](https://www.rfc-editor.org/rfc/rfc9750.html#section-6.6)
permet une réadmission ; son autorisation et sa disponibilité restent à l'application.

### Comparaison pour la V1

| Option | Garantie visée / limite | Coût et décision |
|---|---|---|
| Exclure l'état actif des backups ordinaires ; réadmettre après restauration détectée | Cible les parcours couverts par ces mécanismes, pas une image complète indétectablement restaurée | Périmètre accepté ADR-0011 ; mécanismes et preuves ouverts |
| Ancrage matériel non restaurable | Pourrait distinguer certains retours d'état selon les capacités prouvées | Pas d'API uniforme démontrée sur les quatre OS ; preuves matérielles manquantes |
| Témoin externe avant chaque usage ou réservation sûre | Suppose indépendance, disponibilité et protocole correct de réservation/reprise | Un appel par message contredit la cible UX ; une simple plage ne prouve pas la sûreté des ratchets |
| Nouvelle feuille/époque à chaque redémarrage avant envoi | Peut éviter de repartir directement sur un ancien ratchet, sous hypothèses à établir | Coût par groupe, concurrence, hors ligne ; non retenu comme solution de reprise transparente |

Un renouvellement privé depuis l'ancien état utilise déjà un ratchet de contrôle.
Un renouvellement public standard serait une autre option de profil, avec
métadonnées et arbitrage à analyser ; il ne prouve ni la fraîcheur des rôles
ni celle des révocations. Aucun changement de profil n'est autorisé ici.

Le périmètre recommandé a été accepté explicitement : crash ordinaire repris
normalement ; restauration détectée suivie d'une réactivation avant envoi,
historique lisible préservé ; état actif exclu des backups ordinaires ; pas de
garantie de détection d'une image complète PC ou snapshot d'émulateur avec
tous ses secrets. L'ADR-0011 consigne cette limite ; elle ne démontre aucun
mécanisme d'anti-rollback. Le système d'exploitation compromis est
déjà une limite de l'ADR-0003, mais une restauration légitime d'ancien disque
ne doit pas être qualifiée abusivement de compromission pour éviter ce problème.

### Reprise proposée lorsqu'une restauration est détectée

1. Interdire de nouveaux chiffrements, y compris de contrôle, depuis l'état
   suspect. Ne pas remettre son outbox ancienne en circulation. Conserver les
   intentions et l'historique encore déchiffrables, sans les déclarer frais.
2. Vérifier l'identité/continuité et les droits actuels depuis les autorités
   prévues, pas le seul cache restauré. Si l'identité est perdue : récupération
   renforcée et nouvelle vérification, jamais bootstrap silencieux.
3. Générer le matériel neuf sur un OS/CSPRNG de confiance et faire autoriser
   le remplacement de l'ancienne feuille par un pair habilité. Ne pas exporter
   l'ancien ratchet ou contourner l'approbation multi-appareil.
4. Utiliser l'admission ordonnée et ses contrôles ; reprendre progressivement
   les conversations réellement autorisées. Si aucun approbateur n'est joignable,
   garder lecture/brouillons et attente visible ; pas de promesse de reprise instantanée.
5. Reprendre les intentions selon les règles de déduplication/ACK inconnu,
   puis proposer l'historique facultatif séparément. Ne pas renvoyer à l'aveugle
   un message dont la première publication n'est pas connue.

Cette machine n'est pas implémentée. Exclusions de sauvegarde, signaux de
restauration, stockage séparé et matrice OS restent à démontrer en TC-306.
Le choix d'un périmètre de menace ne ferme pas ces preuves et ne justifie pas
un aller-retour supplémentaire par message courant.

## 4. Cas supplémentaires à prouver

| ID | Résultat à démontrer | Traçabilité |
|---|---|---|
| G01 | Faux admin JSON, attestation hors délégation ou recommandation transitive : aucune admission | R08, S03/S04/S12, TC-303/305 |
| G02 | Attestation contradictoire avec ancrage direct, racine remplacée ou référent inconnu : blocage ciblé | R08, S03/S04, TC-303/309 |
| G03 | Nouveau device/personne, référent extérieur à une conversation privée : aucune extension de droits ni d'historique | R01/R08, S04/S06, TC-303/311 |
| G04 | Crash avant/après fusion et libération, ACK perdu, Commit perdant : reprise idempotente sans Welcome prépublié | R02/R03, S05/S11/S12, TC-304/310 |
| G05 | GroupInfo rejoué, fausse confirmation, branche DS divergente ou auteur hostile : ne pas conclure à un consensus global | R02/R08, S05/S12, TC-304/310 |
| G06 | Échec après consommation du KeyPackage mais avant activation : rollback complet ; succès suivi de rejeu : refus | R03, S05/S10, TC-303/306/309 |
| G07 | Restauration détectée, approbateur absent/révoqué, publication passée inconnue : aucun ancien ratchet utilisé ni faux succès | R07, S08/S13/S16, TC-304/306/502 |
| G08 | Base seule, base+marqueur et image complète : résultat conforme au périmètre annoncé, pas de faux anti-rollback | R07, S16/S17, TC-306/311 |

Les G01–G08 complètent F01–F10 et S01–S20 ; **aucun n'est exécuté ici**.
Mesurer ensuite admission, reprise et messages chauds séparément, avec référent
ou approbateur absent, sans annoncer qu'un budget de message couvre l'onboarding.

Suite distincte du 17 octobre : [C1c](../quality/TC-302-RECOVERY_GUARD.md) exécute
une preuve G06 sur le contexte synthétique et des cas partiels G07/G08 après
demande de mise en place. Ce résultat ne change pas le caractère documentaire
de la présente étude et ne valide ni la réactivation complète ni les détecteurs OS.

## 5. Sortie de cette passe

Décisions acquises : ADR-0010 et périmètre de récupération ADR-0011.
Proposition technique : libération après fusion durable, transaction
d'admission et reprise sans ancien état détecté. Pas de protocole filaire figé.

Prochaine action TC-302 C1 : trancher le contrat R02 sous hypothèses explicites,
la barrière de révocation
Q3 et le hors ligne Q2. Préparer l'addendum transport ADR-0003 ; ne pas le
déclarer accepté parce qu'un parcours produit l'est. Ne pas répéter C1/C1b
ni démarrer TC-303/304/305 avant acceptation du socle et clôture TC-301.

## 6. Contrôles réellement exécutés

Lecture des RFC et des sources, sans compilation ni nouveau téléchargement de
dépendance. SHA-256 de l'archive Cargo OpenMLS 0.9.0 déjà en cache :
`b6b08d90fc020cb5354d5f08ca17711b84c82e2bcc7331753fd94f000d99a8c8`,
identique à Cargo.lock. Les fichiers `creation.rs`, `exporting.rs`, `mod.rs`,
`config.rs` et `updates.rs` sous `src/group/mls_group/` ont été comparés à cette
archive par lecture, sans extraction sur disque : cinq identités exactes.
Cela vérifie la provenance des sources inspectées, pas leur sécurité.

Contrôles documentaires : 89 liens relatifs dans 15 documents, 20 exigences
couvertes par 20 scénarios, dix cas F et huit cas G cohérents, trois fiches
suivantes toujours « À faire ». `git diff --check` réussi ; deux verrous de
distribution actifs et inchangés. Aucun test runtime, essai matériel, benchmark,
audit de dépendances ou CI ; aucune action VM/PC. Les tests proposés restent
à écrire après leurs dépendances et autorisations.
