# TC-302 C1 — Faisabilité des points structurels V3

Étude des sources : 2026-10-12
Mise à jour de décision : 2026-10-17
Statut : première étude documentaire réalisée ; Q4 produit décidée, autres recommandations et preuves ouvertes
Base inspectée : `cb8962a`, OpenMLS verrouillé à `0.9.0`
Nature : revue de sources et de code, pas audit indépendant ni tests cryptographiques

## Résultat et portée

L'étude précise les options pour R02, R07 et R08 de la
[revue interne](../quality/TC-302-SPEC_REVIEW.md). Elle ne ferme aucun constat,
ne choisit pas un nouveau fournisseur et ne lève pas la
[suspension TC-301](../quality/TC-301-SECURITY_HOLD.md).

| Point | Conclusion de cette passe | Porte restante |
|---|---|---|
| R02 — Commit invalide | Une livraison ordonnée sans filtrage prématuré des concurrents évite le blocage artificiel du serveur ; pas une garantie contre toute fragmentation malveillante | Contrat Welcome, politique commune, reprise et tests S05/S12/S13 |
| R07 — Ancien état restauré | MLS possède déjà un `reuse_guard` ; aucune preuve de fraîcheur universelle des snapshots ne découle du stockage OS | Choix du modèle de restauration, mécanisme de fraîcheur et preuves S16 |
| R08 — Annuaire menteur | Vérification initiale obligatoire décidée (ADR-0009) ; continuité et transparence à spécifier, AKD candidat non sélectionné | Ancre initiale, politique de groupe, autorisations et tests S03/S04/S12 |

La sécurité des contenus, la disponibilité du service et la détection d'une
vue divergente sont trois objectifs différents. Un service qui refuse toute
livraison peut toujours empêcher de converser ; aucune solution proposée ne
prétend rendre l'application disponible contre cet adversaire.

## 1. R02 — Ordre des candidats, pas certification serveur

### Sources et observation locale

La [RFC 9750, §5.2–5.3](https://www.rfc-editor.org/rfc/rfc9750.html#section-5.3)
décrit précisément le piège du service qui filtre les Commit concurrents et
avance son époque malgré un candidat invalide. Elle expose aussi une livraison
ordonnée permettant aux clients de retenir le premier candidat valide et
impose de coupler le Welcome à l'arbitrage. Ce n'est pas une nouvelle primitive.

OpenMLS sépare traitement et fusion : inspection du résultat avant
`merge_staged_commit`, selon son [guide](https://book.openmls.tech/user_manual/processing.html).
Le code local verrouillé expose ces deux opérations dans
`openmls-0.9.0/src/group/mls_group/processing.rs`. Le
[laboratoire](../../prototypes/mls/src/lib.rs) fusionne directement un
`StagedCommitMessage` dans `receive` : il n'applique pas encore les rôles V3.
Son chemin d'écho propre compare les octets pending ; ce n'est pas une preuve
d'accord de tous les membres ni de sincérité du service.

### Comparaison et recommandation

| Option | Effet | Conclusion proposée |
|---|---|---|
| Premier ciphertext verrouille définitivement e+1 côté SQL | Un invalide peut bloquer tous les suivants | Rejeter ce modèle comme définition de validité |
| Journal ordonné de candidats, premier valide choisi localement | Pas besoin de déchiffrer au serveur ; contrôles et erreurs restent côté client | Piste privilégiée, sous hypothèses explicites |
| Votes/accusés de réception de tous les appareils | Un absent empêche les changements ; un accusé isolé ne prouve pas la validité pour tous | Ne pas ajouter de consensus ou quorum maison |
| Commit publics | Davantage de métadonnées ; ne résout pas toutes les corruptions de chemin ni les ACL | Pas une correction générale, pas de changement de profil ici |

Séquence **proposée**, pas encore contrat de transport :

1. Le service contrôle identité d'accès, ACL, taille, quota et idempotence,
   puis conserve une position immuable par groupe pour chaque candidat admis.
   Une unicité `(groupe, époque)` sur les seuls candidats opaques ne doit pas
   éliminer le candidat honnête qui suit un invalide.
2. Le client traite le préfixe complet du journal, avec les Proposal et preuves
   nécessaires. Un dépendant manquant signifie « attendre/récupérer », pas
   « candidat invalide ». Une erreur SQL ou de stockage non plus.
3. Le traitement MLS et la politique applicative déterminent la transition
   localement acceptable. Un candidat définitivement rejeté est enregistré
   comme tel sans prétendre avoir atteint l'époque suivante. Le sort du
   ratchet de réception après rejet doit être spécifié/testé transactionnellement.
4. Le premier candidat acceptable de ce préfixe est fusionné. Les intentions
   concurrentes perdantes sont réévaluées, pas leurs anciens ciphertexts.
   L'auteur traite les candidats précédant son écho avant sa propre fusion.
5. L'admission par Welcome reste en attente tant que la liaison au résultat
   de l'arbitrage n'est pas vérifiée. Aucun état « prêt » sur le seul ACK.

Hypothèses : même préfixe livré par un service honnête, état initial cohérent,
règles de validation identiques/versionnées et preuves complètes. Une réponse
d'annuaire changeante au moment du traitement ne peut servir de politique
déterministe ; les rôles doivent se rapporter à l'état authentifié antérieur.

Limite importante : un membre peut fabriquer un chemin accepté par certains
destinataires et rejeté par d'autres ; voir
[RFC 9420, §16.12](https://www.rfc-editor.org/rfc/rfc9420.html#section-16.12).
Le modèle ci-dessus ne promet donc pas une convergence universelle contre un
membre hostile ou un serveur qui présente deux préfixes. Une divergence connue
suspend les **nouveaux envois du groupe concerné**, sans effacer son historique
ni geler les autres conversations. Pas de fusion de branches ni de réadmission
automatique depuis un GroupInfo fourni par le seul service suspect.

Restent à établir avant validation : preuve Welcome/transition vue par un nouvel
arrivant qui ne lit pas les anciens Commit, barrière de retrait sans époque SQL
fictive, admission d'une nouvelle candidature sous quota, et reprise authentifiée
si le dernier membre capable d'agir est absent. Un événement visible ou un
timeout n'apporte aucune de ces preuves. Une correction/addendum de l'ADR-0003
sur le filtrage de transport sera nécessaire si cette orientation est acceptée.

Coût visé : aucun aller-retour supplémentaire pour le message ordinaire ;
travail ajouté lors des changements de groupe, borné contre les floods.
Le délai et la résistance au déni de service restent à mesurer, pas garantis.

## 2. R07 — Restauration, anti-rejeu et fraîcheur

### Correction importante du diagnostic

La [RFC 9420, §6.3.1](https://www.rfc-editor.org/rfc/rfc9420.html#section-6.3.1)
prévoit un `reuse_guard` aléatoire de quatre octets, mélangé au nonce dérivé.
Dans la version locale, `src/framing/private_message.rs` génère ce garde via
`ReuseGuard::try_from_random` sur le chemin sans `virtual-clients-draft` ;
cette feature n'est pas autorisée par le laboratoire. Un ancien état ne
signifie donc **pas automatiquement** un même couple clé/nonce.

Ce garde n'authentifie pas la fraîcheur de la base, ne rétablit ni le journal,
ni les révocations, ni les générations déjà consommées par les destinataires.
Il dépend d'un aléa frais et n'autorise pas les restaurations répétées d'un
ratchet. Il faut conserver cette protection standard, sans la remplacer par
un compteur applicatif ou modifier la primitive.

### Modèles à ne pas confondre

| Situation | Protection ou réaction candidate | Limite |
|---|---|---|
| Crash ordinaire, disque courant | Transaction état/outbox, écrivain unique, retry des octets persistés | Les tests de crash existants ne couvrent pas un snapshot ancien |
| Copie de la base seule | Liaison à l'installation et marqueur séparé protégé par l'OS | Ne protège pas si le marqueur est lui aussi restauré ; atomicité entre stockages à prouver |
| Restauration détectée ou clé absente | Interdire l'usage de l'ancien état d'envoi ; réenrôlement/réadmission explicite | Disponibilité d'un appareil approbateur ou récupération renforcée nécessaire |
| Image complète disque + secrets OS | Nécessite un ancrage réellement indépendant ou une reprise qui ne réutilise jamais cet état | Aucune garantie commune aux quatre OS établie ici |
| Snapshot mémoire/hyperviseur ou OS compromis | Peut restaurer aussi le processus et son générateur aléatoire | Non couvert par les preuves ; aucune exclusion du modèle de menace décidée silencieusement |

### Ce que les plateformes permettent réellement d'affirmer

- **Android** : les [règles Auto Backup](https://developer.android.com/identity/data/autobackup)
  distinguent sauvegarde cloud et transfert d'appareil. `allowBackup=false`
  seul ne suffit pas sur certains appareils Android 12+ pour exclure le D2D.
  Prévoir et tester les règles adaptées aux versions 28+ jusqu'à la cible.
  [KeyMint](https://source.android.com/docs/security/features/keystore/features)
  protège des clés avec des capacités dépendant du matériel ; cette documentation
  ne constitue pas une preuve de compteur monotone applicatif portable.
- **iOS** : [ThisDeviceOnly](https://support.apple.com/guide/security/keychain-data-protection-secb0694df1a/web)
  empêche l'exploitation de certaines copies de trousseau sur un autre appareil.
  Ce fait n'établit pas la fraîcheur d'une base restaurée sur le même appareil.
- **Windows** : [DPAPI](https://learn.microsoft.com/en-us/windows/win32/api/dpapi/nf-dpapi-cryptprotectdata)
  protège des données en les liant généralement à l'utilisateur et à la machine.
  Cela ne démontre pas la détection d'une ancienne image de cette même machine.
- **macOS** : ne pas extrapoler la garantie iOS. Choix du trousseau, exclusion
  des sauvegardes, migrations et scénario même Mac à vérifier en TC-306 ;
  aucune preuve matérielle Apple n'est disponible pour ce lot.

Ces API sont des dépendances de plateforme, pas des bibliothèques libres
embarquées par le projet. Aucun nouveau paquet n'est introduit pour cette étude.

### Contre-exemples aux solutions trop simples

**Témoin seulement au démarrage** : on sauvegarde la base avec un marqueur M,
puis on envoie plusieurs messages sans avancer un témoin extérieur. Restaurer
la copie conserve M des deux côtés alors que le ratchet local est ancien.
Un simple « le serveur connaît cette installation » ne détecte rien.

**Vérification à l'upload** : si l'application a déjà produit un ciphertext à
partir de l'état restauré, refuser son transport ne prouve pas que cet état
n'a pas été réutilisé. Il faut distinguer chiffrement, publication et ACK.

**Réservation de plages** : une réservation externe durable avant usage peut
être une piste de fraîcheur, mais suppose un traitement correct des abandons,
du redémarrage et des générations MLS. La façade actuelle ne fournit pas ce
contrat. Ne pas bricoler les ratchets ni ajouter un service de compteur maison
en affirmant que cela résout le problème. Un témoin sur le même serveur restauré
ou compromis n'est pas indépendant face à cet adversaire.

**Rekey aveugle** : produire un Commit privé depuis l'ancien état utilise encore
son ratchet de contrôle. Ce n'est pas une preuve que l'ancien état n'a pas été
réutilisé. Réadmettre une nouvelle feuille via un pair autorisé est une autre
opération, avec disponibilité, nouvelle liaison de clé et ordre à définir.

### Orientation à approfondir, pas compromis déjà accepté

Séparer l'historique local du secret opérationnel MLS ; exclure ce dernier des
exports/sauvegardes ordinaires ; traiter un retour de sauvegarde comme une
reprise explicite, sans remise en circulation automatique des anciens états.
Préserver l'historique encore déchiffrable, sans le confondre avec une preuve
que l'identité restaurée peut envoyer. L'ADR-0008 peut ensuite transférer une
copie de contenu, jamais le ratchet, selon les droits décidés.

Cette orientation traite les parcours de restauration **identifiés**. Elle ne
résout pas à elle seule une image complète restaurée indétectablement.
R07 reste donc bloquant : C1b doit comparer un ancrage externe/OS démontrable
et une reprise sans ancien état, ou demander une acceptation explicite d'un
modèle de menace plus limité. Ne pas présenter cette dernière option comme
une garantie technique. Le propriétaire n'a pas accepté cette restriction.

UX cible : lecture locale disponible si sa clé l'est, saisie en brouillon
chiffré, reprise de sécurité asynchrone et limitée aux groupes concernés.
Pas de contrôle réseau ajouté à chaque message nominal, ni de renouvellement
de tous les groupes à chaque ouverture sans mesure. Aucun budget de démarrage
ou de réadmission n'est établi par cette étude.

## 3. R08 — Première confiance, transparence et rôles

### Trois options, pas une promesse automatique

| Option | Expérience | Garantie/limite |
|---|---|---|
| Première clé acceptée depuis le serveur, vérification facultative | Aucun geste initial obligatoire | Risque de substitution au premier contact ; nécessite acceptation explicite, pas recommandée pour la cible forte |
| QR/empreinte comparés sur canal fiable, puis continuité signée | Vérification initiale et après remplacement complet de l'identité, pas par message | Ancre initiale vérifiée ; ne garantit pas seule l'absence de toute vue divergente ou révocation cachée |
| Transparence automatique avec implémentation existante et surveillance | Contrôles automatiques aux changements, potentiel meilleur confort | Service, témoins/monitoring, reprise de preuve, licences, charge et audit à intégrer |

Décision Q4 consignée le 17 octobre : le propriétaire accepte la vérification
initiale obligatoire, renouvelée après remplacement complet d'identité, sans
la répéter à chaque connexion ou message. Voir l'[ADR-0009 acceptée](../adr/ADR-0009-verification-identite-initiale.md),
limitée à cette décision produit. Le QR doit provenir de l'autre
appareil ou d'un canal **déjà authentifié**, pas d'une seconde page du même
annuaire suspect. Aucun format QR, code court ou protocole de comparaison maison
n'est figé ici. La liaison compte/clé/appareil et sa continuité restent TC-303/305.

Une vérification directe porte sur l'identité comparée, pas automatiquement
sur tous les membres d'un cercle. Déléguer cette vérification à un administrateur
serait un choix distinct de confiance transitive, à expliciter avant de promettre
« une vérification pour tout le cercle ». L'autorisation de partager l'historique
ne lui confère pas implicitement ce rôle d'autorité d'identité.

Cet arbitrage ne doit pas être redemandé. Il ne ferme ni le contrat de
première confiance dans un groupe ni la détection d'équivoque.

### Composants existants examinés

Lecture des dépôts publics le 12 octobre, sans téléchargement de dépendances
ni installation. L'activité d'un dépôt n'est pas une garantie de maintenance future.

| Candidat | État observé et licence | Adéquation à étudier |
|---|---|---|
| [Meta AKD](https://github.com/facebook/akd/tree/43a60ccf7dfdd8f4b628186410e871192adaf65b) | Non archivé, tête du 12 août 2026 ; manifestes `0.13.0`, `MIT OR Apache-2.0` | Bibliothèque Rust ; candidat privilégié si transparence retenue, pas serveur complet |
| [Signal KT](https://github.com/signalapp/key-transparency-server/tree/30b7a2a40604fbe04545d47f26e4c5a35f5d3161) | Non archivé, tête du 18 août 2026 ; serveur sous AGPL-3.0 | Serveur Go adapté à Signal ; intégration et obligations à examiner, pas composant interchangeable |
| [Google Key Transparency](https://github.com/google/keytransparency) | Dépôt archivé ; Apache-2.0 | Ne pas retenir comme base maintenue d'un nouveau déploiement |

Le [README AKD épinglé](https://raw.githubusercontent.com/facebook/akd/43a60ccf7dfdd8f4b628186410e871192adaf65b/README.md)
décrit une bibliothèque dont l'utilisateur fournit le stockage et rapporte un
audit NCC de 2023 avec corrections ultérieures. Ce rapport historique ne vaut
pas audit de `0.13.0` ni de CircleHaven. Les versions publiées, transitives,
notices, performances et compatibilités seront à vérifier avant sélection.

Le [README Signal épinglé](https://raw.githubusercontent.com/signalapp/key-transparency-server/30b7a2a40604fbe04545d47f26e4c5a35f5d3161/README.md)
référence un protocole IETF en cours et des adaptations propres à Signal.
Sa [licence](https://raw.githubusercontent.com/signalapp/key-transparency-server/30b7a2a40604fbe04545d47f26e4c5a35f5d3161/LICENSE)
est libre, pas « illégale » ou incompatible par principe avec un produit commercial ;
les obligations de source, le périmètre client/serveur et les conditions de
distribution doivent être examinés avant usage. Aucun avis juridique stores
ni changement de licence du code CircleHaven n'est fourni ici.

Le [draft KEYTRANS architecture -10](https://datatracker.ietf.org/doc/html/draft-ietf-keytrans-architecture-10),
publié le 7 octobre 2026, est **un Internet-Draft, pas une RFC finale**.
Il décrit notamment surveillance par contacts et tiers auditeurs avec hypothèses
de disponibilité/non-collusion. Un journal et son « témoin » dans le même domaine
compromis ne démontrent pas une indépendance. L'étude ne sélectionne ni ce
protocole ni une extension MLS en brouillon ; un choix futur devra respecter
l'ADR-0003 ou faire l'objet d'une décision explicite de remplacement.

Déduction pour CircleHaven : vérifier une inclusion dans un journal ne prouve
pas à elle seule que la personne physique a approuvé cette clé. La chaîne
d'approbation, la première confiance, le suivi de ses propres entrées, les
points de contrôle et leur renouvellement après récupération restent nécessaires.
La transparence de l'identité ne prouve pas non plus l'ordre des Commit d'un groupe.

### Rôles et effet sur les performances

Un membre MLS peut signer sans être administrateur. Proposition à spécialiser :
les clients contrôlent les changements contre l'état de rôles antérieur
authentifié, avec version/contexte liés à la transition. Un changement de rôle
ne doit pas s'auto-autoriser à partir de son propre résultat. Les ACL serveur
restent un second contrôle, pas une preuve suffisante pour le client.

À régler : initialisation du propriétaire, transfert concurrent de propriété,
révocations du cercle vers conversations privées, droits d'un administrateur
non participant, profil MLS standard de liaison de ces preuves et récupération.
Ne pas activer `AppDataUpdate`/`extensions-draft` pour combler ces champs.
Le contrat doit aussi porter l'autorité de partage décidée dans
l'[ADR-0008](../adr/ADR-0008-partage-historique-optionnel.md).

Coût cible : validation des preuves lors de l'admission/changement d'identité,
cache lié à la version vérifiée, invalidation sur événement de sécurité et
contrôle périodique borné si transparence. Aucune recherche d'annuaire par
message avec confiance déjà établie. Un cache périmé ou un changement non
vérifiable bloque l'opération sensible, sans annoncer un succès de sécurité.
Les durées de cache et limites de monitoring ne sont pas choisies sans mesures.

## 4. Preuves à produire et prochaine passe

Ces cas sont des **tests à écrire**, pas des tests passés dans ce lot.

| ID | Cas / résultat requis | Traçabilité |
|---|---|---|
| F01 | Invalide puis valide dans le même préfixe ; aucun verrou SQL irréversible | R02, S12, TC-304/310 |
| F02 | Proposal/preuve manquante, erreur disque et rejet définitif distingués | R02, S12/S15, TC-304/309 |
| F03 | Chemin sélectivement invalide, préfixes divergents ; aucune fusion/réadmission aveugle | R02/R08, S12, TC-304/310 |
| F04 | Welcome concurrent/perdant, ACK perdu et crash ; aucune admission déclarée sans liaison valide | R02/R03, S05/S11, TC-303/304 |
| F05 | Restauration base seule, base + secret OS, image complète, mémoire VM ; limites explicitement exposées | R07, S16, TC-306 |
| F06 | Témoin périmé, timeout, témoin restauré, émission jamais uploadée ; contrôle avant réutilisation | R07, S08/S16, TC-306/502 |
| F07 | Reprise pendant révocation, génération déjà consommée, absence d'approbateur | R07, S13/S14/S16, TC-304/306 |
| F08 | Racine substituée, faux QR servi par l'annuaire, changement d'identité et cache ancien | R08, S03/S04, TC-303/309 |
| F09 | Simple membre promu par le seul JSON serveur, changements de rôles concurrents | R08, S12, TC-303/304 |
| F10 | Message chaud, démarrage, reconnexion, import d'historique et surveillance simultanés | R02/R07/R08, S17, TC-301/311 |

Prochaine sous-tâche : **TC-302 C1b**. Décliner l'ADR-0009 dans le parcours de
groupe sans délégation implicite ; approfondir R07 et le lien Welcome/arbitrage
de R02, puis présenter les choix
Q2/Q3/Q5 avec les coûts et limites établis. Préparer les corrections d'ADR et
le modèle de menace, sans les déclarer acceptés par simple « continue ».
TC-303/304/305 restent à faire. TC-302 C2 et la clôture attendent TC-301.

Contrôles effectués ici : lecture des RFC, documentation OS, dépôts amont et
sources locales verrouillées. Le fichier `.cargo-checksum.json` local étant
absent, contrôle de remplacement : SHA-256 de l'archive Cargo déjà en cache
identique au lockfile, puis comparaison des deux sources inspectées avec cette
archive, sans extraction sur disque. Ce contrôle ne vaut pas audit de sécurité.
La cohérence documentaire est contrôlée séparément
dans la fiche TC-302. Aucun test de nonce, snapshot, charge, batterie ou appareil
n'est exécuté. Aucun audit de dépendances relancé, paquet créé, accès au PC,
déploiement ni action sur la VM ; les deux verrous de distribution sont conservés.
