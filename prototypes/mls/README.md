# TC-301 — laboratoire MLS natif

Prototype isolé, **pas un moteur prêt pour l'application**. Il ne contacte
aucun backend et ne modifie ni Flutter, ni le staging. Utiliser uniquement des
identités et messages synthétiques dans des répertoires temporaires privés.
Les bases SQLite de ce laboratoire ne sont **pas chiffrées**.

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

## Tests couverts

Le cycle de groupe inclut création, ajout, Welcome, mise à jour, retrait,
échanges bidirectionnels et perte d'accès aux nouveaux messages après retrait.
Des tests négatifs couvrent corruption, rejeu, mauvais groupe/version,
octets supplémentaires, longueurs malveillantes, hors-ordre, Commit concurrent,
faux écho local, KeyPackage expiré/réutilisé et échec de Welcome.

Les processus enfants quittent brutalement avant/après le commit SQLite pour
dix chemins : création, envoi, réception, réception en lot, ajout, retrait, mise à jour,
jonction, fusion locale et fusion distante. Ce sont 20 scénarios, **pas une
simulation de coupure électrique du stockage**. Un quota SQLite de pages
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
- L'outbox ne possède pas encore le cycle ACK/GC/invalidation d'un Commit
  perdant ; un ancien ciphertext peut être relu, pas fusionné comme un nouveau.
- Pas de chiffrement au repos, de protection contre restauration malveillante,
  de preuve d'effacement physique des secrets ou de notifications système.
- Pas de pont Flutter, de file asynchrone native bornée, de mesure d'énergie
  ou de validation sur les appareils physiques du propriétaire.

Les limites de taille sont locales au laboratoire : 1 Mio par enveloppe,
16 Kio de texte, 256 appareils. La validation de ressources en amont du
décodage n'est pas une preuve complète anti-DoS ; fuzzing et budgets détaillés
restent requis. Voir [les dépendances et licences](SUPPLY_CHAIN.md) et la
[fiche TC-301](../../docs/tasks/TC-301-choix-protocole-v3.md).
