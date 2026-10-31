# TC-302 C1g-1 — Contrôle applicatif avant fusion MLS

Début : 2026-10-24 ; validation finale : 2026-10-31
Base : `620f49d`, suite de [C1f](TC-302-REVOCATION_SIGNAL.md)
Statut : preuve locale réalisée ; autorités injectées, validateur V3 complet non réalisé

## Résultat et décision reçue

C1f-A1 est acceptée, consignée le 24 octobre : un appareil encore autorisé
dans la conversation peut exécuter un retrait déjà demandé et authentifié par
la bonne autorité, après vérification. Il ne gagne ni droit de décider un
retrait, ni droit d'ajout, ni accès à une autre conversation. Ne pas redemander ;
cela n'accepte pas l'ensemble de l'[ADR-0012](../adr/ADR-0012-livraison-admission-v3.md).

Cette première partie de C1g démontre le refus d'une transition avant fusion
sans consommer son état cryptographique. Elle expérimente la séparation
autorité/exécutant/cible et la succession de credential/clé. Ancres, rôles
antérieurs et demandes sont des données de test injectées : **aucune signature
de révocation ou chaîne d'approbation V3 n'est vérifiée**. Aucun format
cryptographique ad hoc ni `verified=true` réseau.

Le laboratoire reste synthétique, avec SQLite non chiffré et sans transport
réel. Ni intégration produit, nouvelle dépendance, levée du gel TC-301 ou
clôture de TC-301/302/R01–R08.

## 1. Contrôle transactionnel

[Device](../../prototypes/mls/src/lib.rs) expose
`receive_with_commit_policy_synthetic`, contrôlant deux chemins :

- distant : après `process_message`, avec son `Sender` validé par MLS, avant
  `merge_staged_commit` ;
- écho propre : octets exacts du pending persisté, auteur local, avant
  `merge_pending_commit`. L'indication `OwnPrivateMessage` seule ne suffit pas.

Le callback reçoit en lecture état courant, auteur et Commit staged sous le
verrou SQL existant. Son erreur annule toute la transaction, y compris les
écritures de ratchet déjà faites par OpenMLS. Aucun groupe modifié ne reste en
cache après rollback. Le test décisif rejette puis retraite **les mêmes octets
après réouverture**.

Le callback doit rester pur, borné et synchrone : pas de réseau, publication,
log de secret ou état externe muté. SQLite ne rend pas ses effets externes
transactionnels. Les preuves manquantes sont à récupérer hors du verrou.
`PolicyRejected` et `PolicyEvidenceRequired` distinguent refus et dépendance
à résoudre ; ce ne sont pas des codes API produit.

Le `receive` historique conserve une politique permissive pour les anciens
scénarios synthétiques : **il n'applique pas les autorisations CircleHaven**.
Le pont Rust reste sur ce chemin historique. Les messages applicatifs
n'appellent pas le validateur de Commit. Le garde C1c reste prioritaire.

## 2. Politique de fixture, pas source de confiance

[commit_policy_tests.rs](../../prototypes/mls/src/commit_policy_tests.rs) est
compilé seulement sous `cfg(test)`. `FixturePolicy` n'est pas désérialisable,
ne lit aucun événement serveur et associe les vraies clés publiques MLS du
test à des comptes/appareils/incarnations fictifs.

| Contrôle | Portée exacte du modèle |
|---|---|
| Vue antérieure | Groupe, époque et authentificateur égaux à la fixture ; pas une preuve indépendante de fraîcheur ni une détection de fork |
| Identité | Paire exacte credential **et** clé, liaison non ambiguë ; toutes les feuilles doivent être résolues |
| Autorité | Appareil actif du même compte/incarnation pour une révocation d'appareil ; propriétaire/admin de la vue antérieure injectée pour un retrait de compte |
| Exécutant | Auteur MLS résolu, actif et non ciblé par une demande connue ; pas de rôle admin nécessaire |
| Cible | Indice résolu dans l'état courant vers l'identité stable ; chaque Remove couvert par une demande |
| Propositions | Remove en ligne par l'auteur du Commit seulement ; autres types, références et auteurs tiers refusés dans ce modèle borné |
| Succession | UpdatePath contrôlé même sans Update ; paire inchangée ou successeur épinglé de même identité et version suivante |

Les pins de succession, demandes et rôles ne sont pas authentifiés ici. Une
version numérique seule ne prouve aucune succession réelle. Le refus de retrait
d'un compte propriétaire est conservateur : transfert, départ volontaire et
suppression de cercle restent hors modèle. La preuve de révocation globale
hors conversation et sa distribution aux conversations privées restent à établir.

Un UpdatePath seul ou un retrait partiel peut être un contrôle admissible sans
satisfaire toutes les obligations. Aucun callback n'efface le hold C1f, même
après retrait réel de toutes les cibles. Les demandes de fixture ne sont pas
un registre durable et ne sont pas consommées par la validation.

## 3. Preuves exécutées

Linux local, Rust 1.99.0, OpenMLS 0.9.0/RustCrypto, versions verrouillées et
mode hors ligne : **68 fonctions moteur**, dont **11 nouvelles**, et **3 tests
Rust du pont** réussis. Les quatre tests de crash existants pilotent toujours
**30 sous-cas de processus**. Aucun nouveau crash brutal ajouté, ni coupure
électrique ou snapshot OS. Formatage et Clippy sans avertissement.

Les onze nouveaux tests couvrent :

1. Membre ordinaire exécutant le retrait des deux appareils d'un compte ;
   traitement chez pairs, auteur et expulsés ; hold inchangé.
2. Mauvais auteur, compte, incarnation, portée, exécutant révoqué ou visé.
3. Pins manquants/ambigus, credential identique avec mauvaise clé, vue périmée,
   authentificateur différent à même époque, demande absente et retrait partiel.
4. Révocation d'appareil par son compte sans rôle admin ; retrait du propriétaire refusé.
5. Refus distant préservant ratchet, pending concurrent et outbox ; restart,
   panne avant commit SQL puis retry exact réussi et invalidation atomique.
6. Refus de l'écho propre, pending préservé, faux écho sans appel à la politique.
7. Remove supplémentaire ou Remove+Add refusé sur les deux chemins ; Welcome
   masqué. Le test vérifie la présence effective des deux propositions.
8. Credential remplacé dans l'UpdatePath : absence de pin, mauvaise identité,
   incarnation ou version refusée ; succession injectée acceptée.
9. Même credential avec une vraie nouvelle clé MLS : refus sans pin puis
   acceptation. **Pas de rotation du magasin persistant de signer Device** ni
   d'émission ultérieure depuis le signer renouvelé.
10. Indice réutilisé : l'ancienne demande ne permet pas de retirer son nouvel occupant.
11. Messages applicatifs/ciphertexts altérés hors callback ; historique préservé
    et garde global prioritaire.

Un expulsé traite son retrait sans obtenir les secrets futurs ; ce chemin ne
prouve pas une confirmation de la nouvelle époque qu'il ne peut pas calculer.
S03/S04/S10/S12/S13 ont des preuves partielles sur fixtures, pas produit.
Tests écrits avec le hook ; aucun échec sur le code précédent revendiqué.
L'essai initial a corrigé l'emploi du type de retour de `swap_members` dans
le montage du test, sans modifier la bibliothèque.

Commandes depuis la racine, avec la toolchain installée dans `PATH` :

```bash
cargo test --manifest-path prototypes/mls/Cargo.toml --locked --offline --features interop
cargo clippy --manifest-path prototypes/mls/Cargo.toml --locked --offline --all-targets --features interop -- -D warnings
cargo test --manifest-path prototypes/mls_flutter/rust/Cargo.toml --locked --offline
cargo fmt --manifest-path prototypes/mls/Cargo.toml --check
cargo fmt --manifest-path prototypes/mls_flutter/rust/Cargo.toml --check
git diff --check
```

Un sous-agent a relu placement du contrôle, API 0.9.0, rollback et assertions ;
ce n'est pas un audit indépendant. La cohérence documentaire est vérifiée dans
la fiche TC-302. Les neuf modifications documentaires préexistantes sont
préservées et exclues du commit de ce lot.

## 4. Coût, limites et suite

Le contrôle ne s'exécute que sur les changements de groupe. Aucun nouvel appel
réseau ni recherche d'annuaire par message courant. Les parcours bornés de la
fixture ne sont pas un cache optimisé : aucun benchmark p95/batterie validé.
Schéma v5 inchangé. Aucun stockage de demande ni format filaire ajouté.
Pour revenir au code précédent, utiliser de nouvelles fixtures ; ne pas
supprimer un garde/hold pour reprendre.

Non exécutés : libcrux, nouvel audit de dépendances, fuzzing, benchmarks,
UI/Dart, matrice OS, matériel, paquets, CI distante, VM/PC ou déploiement.
Dernier audit consigné : 11 octobre ; ce lot ne vérifie pas les releases amont
actuelles et ne lève aucun verrou de distribution.

Suite **TC-302 C1g-2** : origine et continuité vérifiables des preuves avant
le registre durable d'obligations. Définir racines, contexte/incarnations,
état d'autorité antérieur, rejeu et demandes concurrentes ; ne pas remplacer
les fixtures par des champs serveur. Puis tester persistance atomique et
reprise, sans confondre progression partielle et résolution. C1g reste ouverte ;
aucun unlock avant ces preuves et le contrôle de départ du transport. Q2/Q5
suivent, sans répéter C1f-A1 ou Q3.

Sources : [traitement OpenMLS](https://book.openmls.tech/user_manual/processing.html),
[credentials et succession RFC 9420 §5.3](https://www.rfc-editor.org/rfc/rfc9420.html#section-5.3),
[autorisation applicative RFC 9750 §6.1](https://www.rfc-editor.org/rfc/rfc9750.html#section-6.1).
Les règles de fixture sont nos hypothèses de test, pas de nouvelles garanties MLS.
