# TC-302 — revue contradictoire interne du socle V3

Date : 2026-10-12
Périmètre : lot B documentaire, socle v0.1 de `0d1d6e3`
Résultat : huit scénarios examinés ; exigences clarifiées, décisions ouvertes
Nature : analyse de conception, **ni exécution de tests ni audit indépendant**

## Méthode et limites

La revue suit un compte Alice avec téléphone A et ordinateur A2, un autre
compte Bob avec appareil B, et une conversation partagée. Deux groupes privés
du même cercle permettent de vérifier que les appartenances ne se mélangent pas.
Les identités sont fictives, aucun appareil ni serveur réel n'est contacté.

Trois modèles doivent rester distincts : réseau défaillant avec serveur honnête,
membre autorisé malveillant, et service de livraison/d'identité compromis.
Une garantie démontrée dans le premier modèle ne suffit pas dans les deux autres.
L'audit des dépendances reste bloquant ; le présent travail ne le refait pas.

Les constats sont des lacunes ou tensions du **contrat cible**, pas des failles
nouvellement démontrées sur le staging. « Attribué » signifie qu'une tâche porte
la résolution et la preuve attendue, pas que le risque est fermé.

## R01 — Approbation rapide et début réel des messages

Séquence : Alice approuve A2 à t0 ; A est ensuite hors ligne. B envoie m1 à t1.
A ou un autre appareil autorisé réalise l'addition de A2 à t2 ; A2 traite son
Welcome à t3. Un message m2 est alors envoyé dans l'époque qui contient A2.

Constat : l'approbation de compte seule ne donne pas les secrets du groupe à A2.
Promettre m1 sur A2 au seul motif que t1 > t0 contredit l'absence de transfert
d'historique si m1 a été chiffré dans une époque antérieure à son admission.
L'admission à t2 et la disponibilité locale à t3 sont aussi distinctes : un
message de la bonne époque peut arriver avant le Welcome et doit attendre.

Proposition : activation progressive par conversation, état visible de préparation,
début d'accès à l'admission MLS effective ; messages de cette époque rattrapables
après traitement du Welcome. Ne pas utiliser l'heure murale t0 comme condition
cryptographique. Aucun groupe privé supplémentaire n'est ajouté automatiquement.

Décision Q1 demandée au propriétaire ; **aucune réponse présumée**. Preuve attendue :
scénario S06 avec les trois instants, deux conversations et Welcome retardé.
Responsables : [TC-303](../tasks/TC-303-identite-confiance-v3.md),
[TC-304](../tasks/TC-304-epoques-revocation-v3.md). Statut : ouvert, produit.

## R02 — Commit privé invalide retenu par le serveur

Séquence : un membre autorisé envoie un ciphertext déclaré Commit pour l'époque e.
Le serveur valide ACL/bornes et lui attribue la première position de transition.
Les autres membres le rejettent après traitement MLS ; eux restent à e.

Constat : si le serveur considère immédiatement e+1 comme définitivement acquise,
ses préconditions refusent ensuite les tentatives légitimes des membres à e.
Un ACK ou un compteur SQL ne peut donc pas certifier une transition MLS.
À l'inverse, accepter arbitrairement un second Commit peut fragmenter un groupe
où certains appareils auraient validé le premier. Un simple timeout ne résout
pas cette divergence, pas plus qu'une remise à zéro des secrets.

Correction du socle : distinguer **candidat ordonné**, **transition validée
localement** et **disponibilité du groupe**. TC-304/310 doivent définir une
machine de livraison complète, dont le traitement des candidats invalides,
du membre malveillant et du dernier appareil capable de changer l'époque.
Ne pas introduire un quorum d'approbation utilisateur : il est exclu de la V1.
Une confirmation technique éventuelle exige sa propre analyse de sûreté et
de disponibilité ; elle n'est pas choisie dans cette revue.

Preuve attendue : S12, candidat invalide, candidatures suivantes et clients qui
ont traité des vues différentes ; aucune fusion/suppression de secrets sur la
seule foi du serveur. Responsable : TC-304/310. Statut : **bloqueur de conception**.

## R03 — ACK perdu, Commit concurrent et Welcome perdant

Séquence : A prépare C1 et W1 pour A2. B prépare C2 pour la même époque.
Le serveur retient C2 ; la réponse à A est perdue. Un retry de A relit C1
dans son outbox, tandis qu'un ancien W1 arrive à A2.

Constat : les octets persistés rendent un retry idempotent, mais pas encore
légitime. L'outbox doit connaître le sort de la transition avant toute
réémission. Le test natif `concurrent_commits_follow_one_order_and_reject_losing_echo`
rejette l'écho perdant ; il ne prouve pas le cycle serveur ACK/GC/Welcome.
Un KeyPackage exposé à W1 ne doit pas redevenir libre par un simple timeout
si une autre vue peut encore consommer ce Welcome.

Correction du socle : résultat inconnu après timeout, consultation/reprise de
l'opération originale, invalidation durable des dérivés perdants, aucune
nouvelle admission sur la seule base d'une erreur réseau. La preuve du lien
Welcome/transition/groupe/contexte doit fonctionner au-delà d'un simple JSON
de routage. L'écho exact protège les octets, pas leur place dans l'ordre.

Preuve attendue : S05/S11/S12 avec crash entre stockage, publication, réponse,
invalidation et consommation ; aucun Welcome de branche perdante accepté.
Responsables : TC-303/304/305/310/502. Statut : ouvert, technique.

## R04 — Révocation pendant qu'un expéditeur est hors ligne

Séquence : A2 et A sont membres à l'époque e. A est déconnecté. A2 est révoqué
dans le registre ; B prépare son retrait. A écrit un message pour e sans avoir
encore appris cette révocation, puis se reconnecte.

Constat : couper les droits réseau de A2 est immédiat côté service honnête,
mais A2 connaît encore les secrets de e. Un ciphertext publié à tort dans e
peut rester lisible par A2. Un client ne peut pas connaître un changement
survenu durant une coupure sans reprendre une information fraîche.

Proposition : à la reconnexion, rattraper la sécurité avant de publier les
messages en attente ; maintenir l'interface utilisable et le texte en local
chiffré. Si les octets ont déjà été publiés, une réémission sous une autre
époque exige une règle d'identité/déduplication distincte, pas un rechiffrement
aveugle du même identifiant. Le transport doit refuser l'ancien contexte
selon la barrière de retrait définie ; ses contrôles peuvent accompagner la
requête d'envoi existante, sans requête d'annuaire par message nominal.

Preuve attendue : S13, publications juste avant/après retrait, message hors ligne
déjà chiffré et retry après ACK perdu. Définir ce qu'un serveur compromis peut
encore révéler, sans promesse rétroactive. Responsables : TC-304/310/502.
Statut : ouvert, Q2/Q3 et barrière technique.

## R05 — Rattrapage de 90 jours et suppression des secrets

Séquence : A est absent, B envoie m1 dans e, change les membres vers e+1 puis
envoie m2. À son retour, A reçoit d'abord le Commit, puis m1, ou le service a
déjà purgé un contrôle indispensable tout en conservant un message plus récent.

Constat : reprendre uniquement les messages ne reconstitue pas les états MLS.
Supprimer tous les secrets de e avant de traiter m1 peut le rendre illisible ;
les conserver arbitrairement 90 jours augmente l'exposition d'une compromission.
La rétention des enveloppes ne définit pas la tolérance au hors ordre.

Proposition : spécifier séparément journal des contrôles, ordre de rattrapage,
borne temporelle et numérique des secrets retardés et traitement des trous.
Ne pas annoncer « 90 jours rattrapables dans tous les cas ». La conservation
de l'historique local déjà vérifié est encore une autre politique.

Preuve attendue : S14 avec plusieurs retraits, frontière de rétention, compte
toujours membre et appareil effectivement retiré. Décisions Q2/Q5 nécessaires
avant gel des délais. Responsables : TC-304/306/504. Statut : ouvert, produit/technique.

## R06 — Un lot contient un doublon ou un ciphertext hostile

Séquence : un lot de 100 messages contient au milieu un message déjà traité
ou altéré. L'atomicité fait échouer le lot entier. Le serveur renvoie toujours
le même lot après reconnexion.

Constat : l'atomicité évite un état partiel, mais un retry identique infini
empêche toute progression. Sauter le curseur du lot masquerait les éléments
non traités. Un identifiant externe non authentifié ne permet pas de supprimer
sans contrôle un message que le serveur présente comme doublon.

Correction du socle : distinguer duplicata exact déjà traité, conflit et objet
non authentifiable, avec état durable et essais bornés. Un éventuel traitement
par sous-lots doit recommencer sur l'état durable, sans réutiliser un ratchet
annulé. Ne jamais sauter un Commit pour prétendre avancer d'époque. Définir
les conséquences sur l'UI et les quotas, sans logguer le clair.

Preuve attendue : S15 avec échec au premier/milieu/dernier élément, redémarrage,
enveloppes substituées et gros lots répétés. Responsables : TC-309/504, limites
TC-305. Statut : ouvert, technique ; pas de modification du labo dans ce lot.

## R07 — Restauration d'un ancien fichier local valide

Séquence : une image disque ancienne contient un état de groupe et une outbox
cohérents. Elle est restaurée après plusieurs envois. Le client redémarre
et ne voit aucune erreur SQLite.

Constat : atomicité et chiffrement au repos n'établissent pas la fraîcheur de
l'état. Le même snapshot contient aussi l'ancien compteur censé le protéger.
Réutiliser un ancien état d'envoi peut répéter du matériau cryptographique.
Un contrôle réseau après avoir déjà chiffré est trop tard pour empêcher cette
réutilisation. Le prototype ne détecte pas ce scénario.

Exigence de résolution : définir le modèle d'attaquant local et les garanties
réelles des OS ; identifier un ancrage de fraîcheur non restauré avec la base,
ou un comportement de réadmission sûr quand la fraîcheur ne peut être établie.
Ne pas créer un « compteur inviolable » maison et ne pas assimiler restauration
d'une image complète à une simple perte de réseau. Un éventuel contrôle à la
reprise doit être mesuré dans le budget de démarrage, sans être répété par message.

Preuve attendue : S16 avec base, journal, secret OS et image complète restaurés
dans différentes combinaisons, avant toute nouvelle émission. Responsable :
TC-306 avec hypothèses TC-303/304. Statut : **bloqueur de preuve**, Q5.

## R08 — Serveur d'identité menteur et changement de rôle

Séquence : le serveur annonce une clé « approuvée » inconnue à B, ou présente
un membre simple comme administrateur. Ce membre sait produire un Commit MLS
valide mais non autorisé par le produit. À un autre appareil, le serveur
montre une autre liste de clés ou de rôles.

Constat : possession de la clé MLS, droit d'administration et appartenance
approuvée sont trois preuves différentes. L'approbation signée d'un appareil
ne suffit pas à elle seule à authentifier la racine initiale du compte face
à un serveur compromis. Le QR optionnel et le journal de changements ne
garantissent pas une détection automatique d'équivoque.

Exigence de résolution : TC-303 définit les ancres et la distribution des
preuves, la politique de première confiance et de renouvellement ; TC-304
définit les changements de rôles et leur ordre par rapport aux Commit.
TC-305 fige les liaisons canoniques sans réutiliser les preuves V1 hors domaine.
Documenter le risque d'un premier contact non vérifié si la solution choisie
ne le ferme pas ; le faire accepter avant toute revendication forte.

Preuve attendue : S03/S04/S12, faux bootstrap, clé ancienne, suppression d'une
révocation, vues divergentes et membre non administrateur. Responsables :
TC-303/304/305. Statut : ouvert, Q4 ; aucun mécanisme de transparence choisi ici.

## Synthèse et conditions de clôture

| Constat | Exigences du socle | Scénarios | Résolution portée par |
|---|---|---|---|
| R01 | V3-004, V3-006 | S06 | TC-303/304 + Q1 |
| R02 | V3-012, V3-014 | S12 | TC-304/310 + Q3 |
| R03 | V3-005, V3-012, V3-013 | S05, S11, S12 | TC-303/304/305/310/502 |
| R04 | V3-009, V3-014 | S13 | TC-304/310/502 + Q2/Q3 |
| R05 | V3-015, V3-016 | S14 | TC-304/306/504 + Q2/Q5 |
| R06 | V3-010, V3-015 | S15 | TC-305/309/504 |
| R07 | V3-011, V3-017 | S16 | TC-306 + Q5 |
| R08 | V3-003, V3-004, V3-007 | S03, S04, S12 | TC-303/304/305 + Q4 |

Les tâches TC-303/304/305 sont **préparées, pas démarrées ni validées**.
La spécialisation de leurs contrats attend l'acceptation du socle TC-302 ; les
compléments ultérieurs seront incorporés à la spécification avant intégration.
Les bloqueurs structurels R02/R07/R08 exigent une conclusion de faisabilité et
de menace explicite avant d'accepter ce socle ; les y renvoyer ne suffit pas.

Prochaine sous-tâche documentaire : TC-302 C1, étude ciblée de ces trois
bloqueurs et traitement des décisions produit reçues. La clôture de TC-302
reste conditionnée à celle de TC-301 ; aucune reprise de distribution,
garantie de performance ni sécurité de production n'est validée par cette revue.
