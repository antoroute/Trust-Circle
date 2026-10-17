# TC-302 C1c — Garde de restauration et admission transactionnelle

Date : 2026-10-17
Statut : preuve locale partielle réalisée ; aucune intégration produit
Références : [fiche TC-302](../tasks/TC-302-specification-v3.md),
[ADR-0011](../adr/ADR-0011-perimetre-restauration-v1.md),
[étude C1b et cas G](../security/V3_ADMISSION_RECOVERY_STUDY.md)

## Autorisation et périmètre

Après les décisions de périmètre, le propriétaire demande « continue en mettant
en place », puis « continue ». Cette demande permet une première implémentation
bornée **dans le laboratoire natif existant**, au-delà de la préparation purement
documentaire précédente. Elle n'accepte pas tout le contrat TC-302, ne démarre
pas l'intégration produit et ne lève pas la
[suspension des nouveaux paquets](TC-301-SECURITY_HOLD.md).

Seuls des comptes et messages synthétiques en répertoires temporaires sont
utilisés. Aucun nouvel algorithme cryptographique, changement de fournisseur,
dépendance, lockfile, configuration de distribution ou infrastructure.
La base de laboratoire reste **non chiffrée** : ce lot ne satisfait pas
l'exigence complète V3-017 ni l'invariant 23.

## Comportement implémenté

Le moteur [Device](../../prototypes/mls/src/lib.rs) expose
`require_reactivation()` pour recevoir un **signal externe** de restauration.
Il ne sait pas produire ce signal : les détecteurs et exclusions de sauvegarde
propres aux OS restent à concevoir et tester dans TC-306.

| État / opération | Résultat du laboratoire |
|---|---|
| Aucun signal enregistré | Chemin MLS existant ; ce n'est pas une preuve de fraîcheur |
| Signal persisté | Toutes les mutations MLS et lectures d'outbox sont refusées |
| Redémarrage ou autre connexion déjà ouverte | Le signal persisté est relu ; aucun statut « prêt » mis en cache |
| Échec de persistance du signal | Erreur `Storage`, acteur courant bloqué en mémoire ; persistance à réessayer |
| Marqueur manquant/invalide ou version inconnue | Refus sûr, pas de réinitialisation silencieuse |
| Historique déjà validé | Lecture locale conservée si le stockage reste accessible |
| Ancien snapshot complet de la base | Peut restaurer aussi le marqueur ; aucune détection promise |

Le contrôle est exécuté **après `BEGIN IMMEDIATE` et avant tout travail MLS**,
dans la transaction existante. Il couvre aussi les retries idempotents, la
création de KeyPackages et l'initialisation : ces chemins ne permettent pas
de réactiver silencieusement l'état ancien. Le blocage concerne tous les
groupes du même stockage, pas les bases d'autres appareils. La réception de
nouveaux messages est également suspendue ; seule l'inbox déjà validée reste
lisible. Les lectures d'époque et de membres sont des diagnostics historiques,
pas des autorisations fraîches.

Le signal est monotone via cette API. Il n'y a **pas d'API de déblocage** : la
réadmission sûre, les nouvelles clés, l'approbateur et la continuité d'identité
ne sont pas encore spécifiés complètement. L'erreur `RecoveryRequired` reste
interne au laboratoire, pas un nouveau contrat API/FFI de l'application.

La lecture de l'outbox vérifie le marqueur et lit les octets dans un même
snapshot SQL. Elle ne peut pas révoquer des octets déjà retournés à un appelant.
Le futur transport devra sérialiser signal, annulation et départ réseau ;
ce lot n'annonce pas une annulation d'envois en vol. Si l'écriture du signal
échoue, les autres acteurs ne sont pas garantis bloqués avant persistance
réussie ou réception indépendante du signal. Aucun succès durable n'est retourné.

Coût courant ajouté : une lecture d'une ligne locale dans la transaction déjà
nécessaire, **aucun aller-retour réseau supplémentaire**, aucun parcours de
toutes les conversations. Les budgets UX et le surcoût p95 sur les OS cibles
ne sont pas mesurés ici ; les résultats de tests ne prouvent pas la fluidité.

## Schéma et retour arrière

[002-recovery.sql](../../prototypes/mls/schema/002-recovery.sql) ajoute le
marqueur et fixe `user_version=2`. Les anciens fichiers synthétiques utilisaient
la version 0 ; la migration est appliquée une fois sous transaction, sans
perte de leur inbox. Une base déjà migrée ne recrée jamais un marqueur absent.
Une version remise à 0 alors que la table existe échoue également.
Les migrations du fournisseur OpenMLS utilisent leur propre table, distincte
de ce numéro. Ce n'est ni une migration V2 utilisateur ni une migration PostgreSQL.

Pas de migration descendante ou de suppression du marqueur pour débloquer une
base. Un ancien binaire ignorerait ce garde : ne pas l'exécuter sur un état qui
doit rester bloqué. Pour annuler le code expérimental, utiliser une révision
antérieure seulement avec de **nouvelles fixtures jetables**. Aucun fichier
utilisateur, compte, historique ou environnement n'est effacé par ce lot.

## Preuves exécutées

Linux local, Rust 1.99.0, OpenMLS 0.9.0 / RustCrypto, dépendances verrouillées.
Depuis la racine du dépôt, avec la toolchain installée dans `PATH` :

```bash
cargo fmt --manifest-path prototypes/mls/Cargo.toml --check
cargo test --manifest-path prototypes/mls/Cargo.toml --locked --offline --features interop
cargo clippy --manifest-path prototypes/mls/Cargo.toml --locked --offline --all-targets --features interop -- -D warnings
cargo test --manifest-path prototypes/mls_flutter/rust/Cargo.toml --locked --offline
```

Résultats : **30 fonctions de test du moteur réussies**, dont dix nouvelles
(trois tests unitaires et sept tests d'intégration). Le total comprend quatre
tests unitaires, un test pilotant **20 cas de crash en sous-processus**, deux
tests d'interopérabilité OpenMLS ↔ mls-rs, treize tests de cycle de vie, sept
tests de récupération et trois tests de vecteurs. Ne pas additionner les 20
sous-cas comme 20 fonctions supplémentaires. Formatage et Clippy sans avertissement.
Les **trois tests Rust existants du pont Flutter** réussissent également ;
ce n'est pas une validation graphique ou Dart du parcours de récupération.

Les nouveaux tests couvrent : tous les chemins opérationnels après signal,
historique préservé, deux connexions et contention d'écriture, restart,
initialisation interdite, erreur de persistance suivie de retry, corruption du
marqueur, migration du schéma et contre-exemple de snapshot. Ce dernier copie
une base synthétique fermée ; ce n'est pas un essai d'image PC ou d'émulateur.

Le premier essai hors ligne s'est arrêté avant compilation : mls-rs manquait
au cache. Un `cargo test --locked --features interop` a complété le cache avec
les versions **déjà verrouillées**, sans modifier les manifestes/lockfiles ;
les validations ci-dessus ont ensuite réussi hors ligne. Aucun paquet
distribuable ou installeur n'a été construit ou publié.

| Cas de C1b | Preuve C1c / limite |
|---|---|
| G06 | Welcome MLS valide rejeté pour mauvais contexte après staging : KeyPackage récupérable après restart, admission correcte ensuite, rejeu et réutilisation refusés. Pas de contrat d'identité produit validé |
| G07 | Arrêt local exécuté après signal injecté, refus des anciennes opérations et historique lisible. Détecteur, approbateur et réactivation non implémentés |
| G08 | Contre-exemple exécutable : le marqueur dans la même base est restaurable. Pas de preuve anti-rollback, ni matrice OS complète |

Les invariants 13/16/21/23/24 concernés sont suivis dans le périmètre du
laboratoire : authentification MLS et transaction conservées, migration testée,
mais pas de preuve d'identité produit, de stockage sécurisé OS ou de chiffrement
au repos. Le contre-exemple copie uniquement une base synthétique : ce n'est
pas un mécanisme autorisé de transfert de clés privées utilisateur.
Aucun constat R01–R08 n'est fermé par ces preuves partielles.

Contrôles documentaires : 66 liens relatifs valides dans les neuf documents
du lot, 20 exigences uniques couvertes par 20 scénarios, fiches TC-303/304/305
toujours « À faire », deux verrous de distribution actifs et inchangés.
`git diff --check` réussi ; les neuf modifications documentaires préexistantes
du propriétaire sont préservées et exclues du commit du lot.

## Non exécuté et suite

Pas de nouvelle matrice libcrux, d'audit de dépendances, de fuzzing, de benchmark,
de test UI Flutter, d'essai Android/Windows/Apple ou batterie. Le lot vérifie le
chemin local RustCrypto existant sans sélectionner un fournisseur final ni
mettre l'autre en quarantaine. Aucun appel à la VM ou au PC du propriétaire.
Les deux verrous de distribution restent actifs ; le commit utilise `[skip ci]`
pour ne pas relancer les matrices distantes. Les résultats historiques TC-301
ne sont pas remplacés par une validation multiplateforme de ce changement.

Prochaine sous-tâche : **TC-302 C1, contrat d'admission R02 et barrière de
révocation Q3, puis hors ligne Q2**. Le déblocage après restauration dépendra
de ce contrat et des mécanismes OS de TC-306. Aucun nouvel arbitrage n'était
nécessaire pour ce garde conservateur ; les compromis encore ouverts seront
présentés avant d'en figer le comportement produit. TC-301 reste ouverte et
TC-302 ne peut pas encore être acceptée.
