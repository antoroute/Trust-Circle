# Reprise — TC-301, pont validé et mesures du lot C

```text
Travaille dans /root/Projets/Trust-Circle, branche tc301-mls-prototype.
Objectif : poursuivre TC-301 lot C ; ne pas activer MLS dans l'app de production.

Lis entièrement AGENTS.md, docs/PROJECT_CONTEXT.md, la fiche TC-301,
SECURITY_INVARIANTS.md, ADR-0003, docs/quality/TC-301-MLS_PROTOTYPE.md,
docs/quality/TC-301-FLUTTER_BRIDGE.md, prototypes/mls/README.md,
SUPPLY_CHAIN.md et prototypes/mls_flutter/README.md, puis le code et les tests.
Vérifie Git : des changements documentaires préexistants du propriétaire
peuvent être présents. Ne les réécris pas et ne les inclus pas dans tes commits.

Acquis : OpenMLS 0.9.0, MLS1 suite0x0001, RustCrypto de référence, libcrux
comparatif, stockage/outbox/inbox atomiques, 19 tests par fournisseur dont
20 cas de crash, interop mls-rs dans les deux directions de Welcome et subset
de vecteurs avec RefHash. Vérifie les preuves CI
réelles dans le rapport et l'exécution GitHub, pas seulement le YAML.

Le pont existe dans prototypes/mls_flutter : Flutter 3.47.4, FRB 2.13.0,
acteur Rust durable, file bornée, max100 messages par lot atomique. 3 tests
acteur et 15 tests Dart passent localement (dont 13 de configuration NDK) :
1025 réceptions et 62 contrôles dans le scénario FFI.
La matrice native 37194481919 est verte, comme la matrice Flutter complète
37211775266 sur b66f188 (6/6 jobs). Les quatre OS exécutent le scénario
graphique, avec Android/iOS en émulation/simulation debug et Windows/macOS
en profile. Les agrégats sont dans docs/quality/evidence/TC-301-ci-flutter.json.
Ne relance pas tout sans changement de code nécessitant cette vérification.
Le test hôte charge explicitement build/native_assets/<os>, alors que l'app
et flutter drive conservent le chargeur standard : ce sont deux preuves distinctes.
Ne confonds pas les ticks Dart, les frames rendues et les mesures sur matériel.
Prépare le lot C et la comparaison V2/V3 physique, sans activer MLS
dans l'app ni ajouter de réseau ou de données réelles dans le laboratoire.
Priorité : artefacts locaux simples, protocole à froid/chaud et isolation des
pointes de latence Windows (253,60 ms p95 sur cet hôte CI contre cible chaude
100 ms) et des frames lentes Android debug émulé. Aucun budget n'est accepté.
Ne réduis pas synchronous=FULL ni les contrôles d'authenticité pour accélérer.

Cargo choisit le toolchain depuis le dossier courant, pas --manifest-path :
garder les deux rust-toolchain.toml du laboratoire synchronisés en 1.99.0.
Le runtime du pont compile hax/libcrux-sha3 même avec RustCrypto ; l'avis
RUSTSEC-2026-0173 reste visible. Ne pas masquer les alertes de dépendances.
Le bridge verrouille libc 0.2.189 : 0.2.190 casse backtrace 0.3.76 sur iOS.
Le hook adapte le niveau NDK, codé en dur à 35 par native_toolchain_rust 1.0.4+0,
à celui fourni par Flutter. Suivre ces deux contournements documentés, sans
shim cryptographique ni mise à jour non testée. Mac compile ARM + Intel, mais
le runner n'exécute qu'ARM. Android API 28 n'a pas encore de preuve d'exécution.

Attention : OwnPrivateMessage n'est pas une preuve d'authenticité.
La fusion locale exige l'écho exact du Commit pending persisté atomiquement.
Ne réutilise pas d'état mémoire après rollback. Ne confonds pas un test
d'arrêt de processus avec une protection contre restauration d'ancien disque.
Le stockage de laboratoire n'est pas chiffré et ses credentials ne sont pas
approuvés CircleHaven. Tout doit rester synthétique.

Le propriétaire n'a toujours qu'Android et Windows. Aucun accès SSH à son PC
n'est autorisé à réouvrir automatiquement. Préparer des commandes/artéfacts
à exécuter ou demander un nouvel accès temporaire si vraiment nécessaire.
Il possède un Samsung S23 mais préfère les émulateurs Pixel d'Android Studio
sur son PC : privilégier cette voie, sans présenter les résultats comme des
mesures sur téléphone physique. La version Android du S23 n'est pas connue.
Les runners Apple permettent compilation/simulation, pas les mesures batterie.
La procédure docs/quality/TC-301-LOCAL_VALIDATION.md est prête ; aucun test
utilisateur n'a encore été exécuté. Distinguer debug émulé et profile physique.
Le backend staging n'a pas à être modifié pour ce lot.

Aucune donnée V2 ne doit être migrée. Ne déclare TC-301 terminée que lorsque
tous ses critères sont prouvés ; reporte explicitement les manques. Signale
une décision produit/architecture indispensable avant de la prendre.
Termine par résultats, preuves, limites, risques et prochaine sous-tâche.
```

Modèle conseillé pour les transitions, le pont et la revue de sécurité :
**GPT-6 Astra, raisonnement maximal**, si disponible dans la session.
C'est une recommandation liée au risque de cette tâche, pas une obligation
pour les modifications purement documentaires. Référence vérifiée avec
OpenAI Docs : [fiche officielle GPT-6 Astra](https://developers.openai.com/api/docs/models/gpt-6-astra).
