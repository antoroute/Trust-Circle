# TC-301 — laboratoire MLS natif

Prototype isolé, **pas un moteur prêt pour l'application**. Il ne contacte
aucun backend et ne modifie ni le client principal, ni le staging. Utiliser uniquement des
identités et messages synthétiques dans des répertoires temporaires privés.
Les bases SQLite de ce laboratoire ne sont **pas chiffrées**.

Les [nouveaux paquets sont suspendus](../../docs/quality/TC-301-SECURITY_HOLD.md).
Les commandes ci-dessous décrivent les capacités du laboratoire, pas une levée
du gel ni une invitation à exécuter la matrice libcrux. Pour C1c–C1e, seuls les tests
locaux verrouillés/hors ligne RustCrypto et le pont Rust ont été exécutés.

## Exécuter

Depuis ce dossier, avec Rust/rustup et un compilateur C :

```bash
cargo fmt --check
cargo clippy --locked --all-targets --features interop -- -D warnings
cargo test --locked --features interop
cargo clippy --locked --all-targets --features interop,libcrux -- -D warnings
cargo test --locked --features interop,libcrux
cargo run --locked --release --features prototype -- benchmark 10 50 dense
cargo run --locked --release --features libcrux -- benchmark 256 50 sparse
```

Le flag `prototype` est obligatoire. Sans lui, aucune API applicative ni
commande de laboratoire n'est exportée. `interop` ajoute uniquement le pair
de test mls-rs. `libcrux` remplace le fournisseur OpenMLS comparé, sans changer
la suite `0x0001`. Aucun compte existant n'est à migrer.

## Persistance et séquence d'un message

`Device` possède une connexion SQLite et un fournisseur crypto durable.
Chaque mutation commence par `BEGIN IMMEDIATE`, recharge le groupe, puis
écrit état MLS et outbox/inbox dans **la même transaction**, avec
`synchronous=FULL`. Elle ne rend son résultat qu'après `COMMIT`.
Le codec du stockage OpenMLS est une sérialisation JSON de laboratoire, pas
un format réseau ni une invention cryptographique.

- Envoi : identifiant d'opération borné, empreinte de ses paramètres,
  chiffrement OpenMLS, persistance état + ciphertext. Une reprise retourne
  les octets déjà produits ; changer les paramètres sous le même identifiant
  échoue. Rien n'est rechiffré pour un retry réussi.
- Réception : contrôle taille/version/format, traitement OpenMLS authentifié,
  puis persistance atomique état + message. Une erreur ne publie pas de texte.
- Changement de groupe : préparation d'un Commit privé, état pending,
  outbox et copie exacte du ciphertext pending dans une transaction. L'auteur
  ne fusionne qu'au retour des **mêmes octets**, dans l'ordre fixé par le
  service de livraison simulé. Le destinataire vérifie via OpenMLS avant fusion.
- Reprise : aucune instance `MlsGroup` modifiée ne survit à un rollback SQL.
  L'instance crypto reste vivante ; le groupe est actuellement rechargé à chaque
  transaction. Le cache produit reste à concevoir ; un acteur asynchrone de
  laboratoire est maintenant expérimenté dans `../mls_flutter`.
- Réception en lot : `receive_batch` accepte 1–100 messages applicatifs privés,
  au plus 1 Mio au total, dans une transaction unique. Un message altéré,
  rejoué, un Commit ou une erreur SQL annule tout le lot, état et inbox compris.
  Les messages de contrôle doivent être traités séparément dans leur ordre.

Important : l'erreur OpenMLS `OwnPrivateMessage` seule n'est **pas une
authentification** du message local. L'auteur a déjà consommé sa clé d'envoi
et ne peut pas simplement redéchiffrer ce message privé. Seule la comparaison
exacte avec son Commit pending persisté autorise ici la fusion locale.
L'écho ne prouve pas que tous les pairs l'ont reçu ni que le serveur est honnête.

## Welcome différé — TC-302 C1d

Un Commit pending retourne `welcome: None`, même via `outbox` ou un retry.
Le Welcome reste stocké localement jusqu'à fusion durable du Commit exact :

```rust,ignore
let add = author.add(group, "add", &[key_package], Fault::None)?;
// Le transport simulé retourne le Commit dans son ordre ; ce n'est pas un consensus.
author.receive(group, &add.message, Fault::None)?;
let released = author.outbox("add")?; // Welcome désormais accessible.
```

Un Commit concurrent valide fusionné invalide atomiquement l'ancienne sortie :
`Superseded` après restart/retry, sans recréer d'opération. La trace d'idempotence
reste, les octets perdants sont retirés logiquement, sans promesse d'effacement
physique. Un candidat invalide ou une panne SQL n'invalide pas le pending.
Un test démontre aussi deux libérations incompatibles sous livraison divergente :
**fusion locale et même numéro d'époque ne prouvent pas un accord global**.
Voir [preuves et limites C1d](../../docs/quality/TC-302-ADMISSION_RELEASE.md).

## Sorties applicatives périmées — TC-302 C1e

Une fusion MLS réussie, propre ou distante, invalide les anciennes sorties
`application` du groupe dans la même transaction. `outbox` et retry renvoient
`Superseded`, sans recréer d'opération ; un autre contenu sous le même
identifiant reste un conflit. Erreur SQL ou crash avant commit : ni la fusion
ni l'invalidation ne survit. Les autres groupes et l'inbox sont préservés.

Cette règle de laboratoire s'applique à **toute** transition d'époque. Les
Commit historiques restent disponibles pour le rattrapage ordonné ; un Welcome
fusionné conservé ne prouve pas une admission actuelle. Ni préparation ni
candidat invalide ne déclenche l'invalidation. Les octets déjà retournés ne
peuvent pas être rappelés ; suppression logique, pas effacement physique.

Le schéma v4 ajoute un index partiel et bloque conservativement une ancienne
base v3 contenant des sorties applicatives, dont l'époque ne peut pas être
reconstruite. Sans ces sorties, pas de nouveau signal ; un garde déjà actif
reste actif. Aucun déblocage ou downgrade. Arrêter tous les acteurs avant mise
à niveau ; anciens binaires simultanés non supportés.

Ce n'est **pas** la barrière Q3 complète : pas de signal authentifié ni d'intention
de retrait durable. Un contre-test montre qu'un Update concurrent peut avancer
l'époque tout en laissant le membre visé lire les nouveaux messages. L'indice
de feuille peut aussi être réutilisé pour une autre identité. Avant intégration,
conserver intention et copie locale chiffrée séparément : une invalidation ne
doit pas perdre du contenu ni déclencher une réémission aveugle.
Voir [preuves et limites C1e](../../docs/quality/TC-302-EPOCH_OUTBOX.md).

## Arrêt après un signal de restauration — TC-302 C1c

`require_reactivation()` persiste un arrêt de toutes les mutations MLS et de
la lecture de l'outbox. Le contrôle se fait dans la transaction existante,
avant tout travail MLS, y compris lors d'un retry. L'inbox déjà validée reste
lisible. Le signal survit au redémarrage et est relu par les autres connexions.
Si sa persistance échoue, l'acteur courant reste bloqué en mémoire ; les autres
acteurs ne sont pas garantis bloqués tant que le signal n'est pas durable.

C'est un **point d'entrée pour un futur détecteur**, pas un détecteur lui-même.
Un ancien snapshot peut restaurer le marqueur ; `reactivation_required()==false`
ne prouve pas la fraîcheur. Il n'y a pas d'API de déblocage ni de réadmission
implémentée. Des octets déjà remis à un transport ne peuvent pas être rappelés
par cette API. Aucun contrôle réseau supplémentaire n'est ajouté par message,
mais le surcoût sur les appareils cibles reste à mesurer.

Le schéma C1c ajoutait `user_version=2` ; la migration C1d mène de v0/v2 à 3,
puis C1e à 4, sans effacer l'inbox. À l'étape C1d, une ancienne outbox ou un
pending sans preuve d'issue active le garde : aucune ancienne sortie libérée
par supposition. Marqueur absent/invalide
et version inconnue échouent sans reset.
Ne pas revenir à un ancien binaire sur une base devant rester bloquée : il
ignorerait le garde. Voir [preuves, limites et reprise](../../docs/quality/TC-302-RECOVERY_GUARD.md).

## Tests couverts

Le cycle de groupe inclut création, ajout, Welcome, mise à jour, retrait,
échanges bidirectionnels et perte d'accès aux nouveaux messages après retrait.
Des tests négatifs couvrent corruption, rejeu, mauvais groupe/version,
octets supplémentaires, longueurs malveillantes, hors-ordre, Commit concurrent,
faux écho local, KeyPackage expiré/réutilisé et échec de Welcome.

Les processus enfants quittent brutalement avant/après le commit SQLite pour
dix chemins : création, envoi, réception, réception en lot, ajout, retrait, mise à jour,
jonction, fusion locale et fusion distante. Ce sont 20 scénarios, **pas une
simulation de coupure électrique du stockage**. C1d ajoute quatre cas de crash
avant/après libération ou invalidation du Welcome ; C1e ajoute quatre cas
avant/après fusion et invalidation applicative, soit **28 au total**. Un quota SQLite de pages
force aussi une erreur de capacité pendant l'envoi et vérifie la reprise.
Restaurer malicieusement un ancien fichier complet n'est pas détecté ici.

L'interopérabilité utilise mls-rs, sans en faire notre moteur produit.
`tests/vectors` contient un **sous-ensemble** de fixtures publiques OpenMLS
épinglées, avec provenance, SHA-256 des fichiers amont et notice MIT : formats
TLS, vérification SignWithLabel et RefHash/séparation des labels. Les Welcome
sont testés dans les deux directions OpenMLS ↔ mls-rs. Ni la totalité du corpus RFC ni un audit
indépendant ne sont revendiqués.

## Mesures reproductibles et limites

`benchmark N S dense|sparse` accepte 2–256 appareils, 10–1000 échantillons et
des messages de 1 Kio. L'arbre clairsemé retire une feuille sur deux. Tous les
appareils rejoignent initialement ; ensuite seuls l'auteur et le dernier pair
traitent les mises à jour chronométrées. Ce n'est pas un test de débit réseau
vers 256 appareils simultanés.

Les sorties sont uniquement des agrégats p50/p95. Le lot de 100 messages est
mesuré 10 fois ; chaque réception conserve sa propre transaction. Pour une
mesure disque, placer `TMPDIR` sur un volume réel et vérifier son type : le
`/tmp` de certains hôtes est en RAM. Ne pas lancer des compilations en même
temps que les mesures de comparaison. Les temps n'incluent pas Flutter,
SQLCipher, le réseau, la batterie ni la baseline V2 sur le même appareil.

## Limites avant intégration

- Identités MLS basiques synthétiques : aucune validation d'approbation de
  compte/appareil, de rôles ou de transparence de clés dans ce laboratoire.
- Pas encore de binding complet au contexte CircleHaven/AAD ni de Delivery
  Service réel ; les méthodes simulent des entrées autorisées.
- Le paramètre expérimental `max_past_epochs=0` rejette les messages d'anciennes
  époques. La politique hors-ligne/rétention compatible avec l'UX attend TC-304.
- L'outbox invalide localement les Commit perdants depuis C1d et les anciennes
  sorties applicatives après fusion depuis C1e, mais pas encore
  de cycle transport ACK/GC ni d'annulation d'octets déjà remis au transport.
  Un ancien contrôle fusionné reste lisible, sans preuve de droits actuels.
  Pas de barrière de révocation avant fusion ni de conservation séparée des intentions.
- Pas de chiffrement au repos, de protection contre restauration malveillante,
  de preuve d'effacement physique des secrets ou de notifications système.
- Pont et acteur asynchrone expérimentaux dans `../mls_flutter`, pas dans le
  client principal ; aucune mesure d'énergie ni validation MLS sur les appareils
  physiques du propriétaire.

Les limites de taille sont locales au laboratoire : 1 Mio par enveloppe,
16 Kio de texte, 256 appareils. La validation de ressources en amont du
décodage n'est pas une preuve complète anti-DoS ; fuzzing et budgets détaillés
restent requis. Voir [les dépendances et licences](SUPPLY_CHAIN.md) et la
[fiche TC-301](../../docs/tasks/TC-301-choix-protocole-v3.md).
