# TC-302 C1g-2b.2 — Référent et consultation sûre des preuves connues

Date : 2026-11-05 — base `242c379`
Statut : sous-lot expérimental réalisé ; **C1g-2 et TC-302 restent ouverts**
Complète [C1g-2b.1](TC-302-AUTHORITY_PROOFS.md), sans accepter un format produit

## Résultat

Le [banc d'autorité](../../prototypes/mls/authority/model.mjs) accepte maintenant
le cas positif d'une identité initialement inconnue, attestée par un référent
directement vérifié et explicitement choisi. Cette confiance reste propre au
cercle et conserve sa provenance ; elle n'entre pas dans le registre de confiance
directe et ne confère aucune appartenance, rôle ou approbation d'appareil.

Il conserve également des états publics de compte déjà validés, pour consulter
une preuve antérieure sans revenir à un état opérationnel ancien. Un changement
bénin concernant un autre appareil ne force plus à refaire la preuve ; un auteur
révoqué, un appareil absent de l'état initial ou une dépendance inconnue reste
refusé. Un conflit authentifié entre transitions de rôles installe désormais
un arrêt local des nouvelles autorisations du cercle dans ce modèle.

**47 tests Node**, dont **18 nouveaux**, passent. Le code reste entièrement en
mémoire, séparé du moteur MLS, de Flutter et des backends. Racines et consentements
sont simulés, pas de QR réel. Ce n'est ni une chaîne V3 intégrée ni une preuve
de synchronisation entre appareils. Aucune nouvelle dépendance ou distribution.

## 1. Décision produit C1g-A2

Réponse du propriétaire le 5 novembre : **« Nouvelle confirmation, attente
maintenue »**. Si l'administrateur ayant demandé un retrait perd ses droits
avant l'exécution, un administrateur encore habilité doit confirmer ; la
conversation reste en attente. Consigné dans l'[ADR-0012](../adr/ADR-0012-livraison-admission-v3.md).

Le test montre le refus de l'ancienne demande et la possibilité de vérifier
une nouvelle demande de même cible par le propriétaire actuel. **Il ne lie
pas encore la confirmation à une obligation durable et ne libère aucun hold.**
La décision ne concerne pas la durée de vie des anciennes attestations d'identité
après perte du référent ; ce contrat reste à définir séparément.

## 2. Parcours positif du référent

Le cas d'essai part d'un cercle de personnes déjà vérifiées, avec un candidat
**extérieur au cercle et absent du registre direct du destinataire**. On évite
ainsi de prétendre vérifier la délégation alors que le sujet serait déjà fiable.

1. Le référent dispose, dans sa propre vue, d'une vérification directe du sujet.
   Le helper d'émission refuse une personne seulement connue via une attestation.
2. Il signe une attestation liée à l'environnement, la genèse/génération du
   cercle, son état de rôles, son appareil et sa chaîne d'approbation, ainsi
   qu'au compte/incarnation/racine exacts du sujet.
3. Le destinataire doit avoir directement vérifié le référent, puis avoir
   explicitement délégué la vérification à ce référent précis dans ce cercle.
   Un autre admin, même vérifié, ne remplace pas silencieusement ce choix.
4. `IdentityDelegation` vérifie signature, autorité courante, contexte et sujet
   attendu ; la genèse du candidat est vérifiée contre l'empreinte attestée.
5. Il conserve une provenance `attested`, le référent, le cercle et la référence
   de preuve. Un scan direct ultérieur correctement simulé donne `direct`,
   sans dépendre ensuite du rôle du référent.

La provenance déléguée n'est pas ajoutée à `TrustedAccounts`. Le sujet ne peut
donc ni devenir référent transitif, ni obtenir un rôle, ni faire approuver ses
clés comme membre par cet essai. Son admission ultérieure reste un parcours
distinct à relier aux contrôles MLS. Aucun secret de conversation n'est transmis.

Une contradiction avec une racine directement connue bloque l'utilisation,
y compris si cette contradiction est apprise après mise en cache ; les preuves
ne sont pas effacées. La comparaison est isolée par environnement pour qu'un
compte de test ne contamine pas la confiance d'un autre environnement. Un
remplacement de racine attestée exige un futur parcours explicite, pas un écrasement.

**Limite irréductible de ce mécanisme :** le récepteur vérifie que le référent
affirme une vérification directe, pas qu'un humain a réellement comparé le QR.
Le contre-test d'un référent menteur accepte sa signature valide : c'est le
risque déjà accepté dans [ADR-0010](../adr/ADR-0010-referent-identite-groupes.md),
pas une attestation devenue indépendante de son auteur.

## 3. Preuves historiques sans réactivation de droits

`Account` garde des snapshots **publics** de son préfixe local validé. Aucun
snapshot, rôle ou résultat « verified » fourni par le réseau n'est importé.
La référence demandée doit être présente dans cet historique borné.

Pour une nouvelle autorisation opérationnelle, le vérificateur exige :

- appareil actif avec la clé attendue dans l'état référencé ;
- même appareil/incarnation toujours actif, avec exactement la même clé,
  dans l'état actuel du même registre ;
- parent de rôles/cercle exact courant, signature et contexte valides.

Cette règle repose sur les invariants **du banc** : clé immuable par incarnation,
pas de réactivation après révocation, pas de réemploi de clé et préfixe local
linéaire. L'ajout ou le retrait d'un autre appareil ne retire donc pas les droits
du signataire. Les tests prouvent que cela conserve la validité d'une attestation
et permet un événement de rôle retardé, sans accepter un auteur devenu révoqué.
Ne pas généraliser si une future rotation modifie ces hypothèses.

La genèse d'un cercle est un cas particulier : son empreinte étant **déjà
ancrée**, on peut vérifier sa signature avec une clé historique connue, même
si ce créateur a ensuite changé d'appareil. Cela ne réactive pas sa vieille
clé : un nouvel ordre doit encore passer les contrôles actuels. Aucun import
de genèse non ancrée n'obtient cette exception.

Les transitions du registre de compte gardent leur parent exact courant.
Une signature référant un parent ancien n'est pas une preuve de date de création.
Si l'auteur a perdu ses droits, on ne déclare pas automatiquement qu'un ordre
retardé était légitime « à l'époque » ; A2 impose la nouvelle confirmation pour
le retrait concerné. Un parent manquant reste une dépendance à résoudre, pas
une permission de substituer un vieux registre ou de choisir une autre branche.

Cela améliore la consultation des dépendances **déjà validées** et le rattrapage
simple ; la récupération de longues histoires depuis le réseau, leurs preuves
de complétude, l'expiration et la reprise après perte locale ne sont pas résolues.

## 4. Divergence : arrêt borné au modèle de rôles

Si le cercle reçoit un second enfant signé et autorisé d'un parent connu,
différent de celui déjà accepté, `quarantined` devient vrai. Les nouvelles
autorisations de retrait, changements de rôles et attestations sont refusées.
Pas de méthode pour lever ce garde ni de fusion automatique des branches.

La signature et les permissions sont contrôlées **avant** cet effet. Une
signature invalide, un membre non habilité, une mauvaise séquence ou un parent
inconnu ne suffisent pas à déclencher la quarantaine. Tests dédiés.

Cette preuve dépend du propriétaire et des appartenances immuables dans ce
modèle réduit. Elle ne se transpose pas telle quelle à un transfert de propriété
ou à une admission. Elle ne bloque pas les messages du vrai moteur, qui n'importe
pas ce banc. **Les forks de compte ne déclenchent pas encore de quarantaine
globale**, et la saturation du quota ne suspend pas toutes les lectures/droits.
Le garde est seulement en mémoire et se perd en reconstruisant le modèle.
Un fork caché ou une révocation retenue reste indétectable par ces seuls contrôles.

## 5. Validations et effets UX

47 fonctions Node, syntaxe et `git diff --check` réussis. Relance locale verrouillée
hors ligne : 82 fonctions moteur RustCrypto, 3 du pont Rust, les 30 cas de crash
existants, Clippy et fmt réussis. Pas de nouveau crash natif : code Rust inchangé.
Commandes dans le [rapport précédent](TC-302-AUTHORITY_PROOFS.md#6-coût-et-vérifications-du-4-novembre).

La relecture interne a fait corriger la recherche d'identités directes pour
l'isoler par environnement et ajouter le test de contradiction apprise après
cache. L'ancien test de conflit de rôles a été remplacé par la régression du
garde désormais attendu. Les trois contre-exemples principaux restent présents :
révocation cachée, référent menteur, reconstruction de mémoire perdant les acquis.

La validation d'une preuve opérationnelle ajoute deux consultations locales
de clé (état connu et actuel), pas une requête réseau. Les snapshots sont bornés
par les limites existantes de comptes/événements/appareils. `status()` d'une
attestation refait sa vérification ; aucun cache optimisé par versions n'est
encore annoncé. Ni durée du runner, ni tailles du lot précédent ne valident
les budgets Windows/Android/Apple ou l'effet batterie.

Pas d'audit dépendances actualisé, de benchmark, fuzzing, UI/OS, paquets, VM/PC,
nouvelle bibliothèque ou changement de fournisseur. Deux verrous de distribution
maintenus ; derniers audits TC-301 documentés toujours ceux du 11 octobre.
Relecture par sous-agent, pas audit cryptographique indépendant.
Contrôle documentaire : 120 liens relatifs dans onze documents, 20 exigences
uniques couvertes par 20 scénarios ; TC-303/304/305 restent « À faire ».

## 6. Suite C1g-2c — preuves reçues et obligations durables

Le prochain lot doit conserver de façon transactionnelle les preuves validées,
leurs références d'autorité, les cibles stables, les obligations et les gardes,
puis tester crash/rejeu et la confirmation A2. Commencer par le contrat de
persistance et sa frontière de confiance : **ne pas faire passer un objet JSON
du banc Node pour une preuve que le moteur Rust aurait vérifiée**.

Conditions avant intégration et reprise, toujours ouvertes :

- choix du format/validateur natif standard, interopérabilité et audit, sans
  coder un décodeur crypto maison ni contourner le gel des dépendances ;
- réception bornée/rejeu de preuves complètes, références manquantes, état
  durable monotone et arrêt après signal de restauration ;
- composition de la confiance déléguée avec l'admission MLS et preuve de
  possession réelle des clés, sans promotion en confiance directe globale ;
- confirmation liée à l'obligation exacte, aucune nouvelle cible implicite ;
- preuve de retrait de toutes les cibles et publication sérialisée, sans enlever
  les autres gardes ; aucun unlock dans les lots actuels ;
- durée de vie/remplacement du référent, rattrapage après expiration Q2/Q5,
  politique de saturation et garanties réalistes en cas de serveur divergent.

Les choix déjà reçus ne sont pas à redemander. Aucun nouvel arbitrage nécessaire
pour préparer ce contrat de persistance ; soumettre les choix produit encore
ouverts lorsque leurs coûts/conséquences sont établis. R01–R08 restent ouverts,
TC-303/304/305 ne démarrent pas. Retour arrière : uniquement sur fixtures neuves ;
ne pas utiliser un ancien banc pour contourner un garde ou une révocation connue.
