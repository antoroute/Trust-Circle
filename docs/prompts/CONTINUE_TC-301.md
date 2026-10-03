# Reprise — TC-301, après le laboratoire natif

```text
Travaille dans /root/Projets/Trust-Circle, branche tc301-mls-prototype.
Objectif : poursuivre TC-301 lot B ; ne pas activer MLS dans l'app de production.

Lis entièrement AGENTS.md, docs/PROJECT_CONTEXT.md, la fiche TC-301,
SECURITY_INVARIANTS.md, ADR-0003, docs/quality/TC-301-MLS_PROTOTYPE.md,
prototypes/mls/README.md et SUPPLY_CHAIN.md, puis le code et les tests.
Vérifie Git : des changements documentaires préexistants du propriétaire
peuvent être présents. Ne les réécris pas et ne les inclus pas dans tes commits.

Acquis : OpenMLS 0.9.0, MLS1 suite0x0001, RustCrypto de référence, libcrux
comparatif, stockage/outbox/inbox atomiques, 15 tests par fournisseur dont
18 cas de crash, interop mls-rs et subset de vecteurs. Vérifie les preuves CI
réelles dans le rapport et l'exécution GitHub, pas seulement le YAML.

Construis un pont Flutter/Rust asynchrone minimal dans un harness isolé,
avec file bornée, sans ajouter de primitives Dart, sans réseau, sans données
réelles et sans activer V3 dans l'app. Exécute le même cycle de groupe et
mesure séparément pont, moteur et stockage. Étends les vecteurs ainsi que
le scénario de création/Welcome dans l'autre direction interop.

Attention : OwnPrivateMessage n'est pas une preuve d'authenticité.
La fusion locale exige l'écho exact du Commit pending persisté atomiquement.
Ne réutilise pas d'état mémoire après rollback. Ne confonds pas un test
d'arrêt de processus avec une protection contre restauration d'ancien disque.
Le stockage de laboratoire n'est pas chiffré et ses credentials ne sont pas
approuvés CircleHaven. Tout doit rester synthétique.

Le propriétaire n'a toujours qu'Android et Windows. Aucun accès SSH à son PC
n'est autorisé à réouvrir automatiquement. Préparer des commandes/artéfacts
à exécuter ou demander un nouvel accès temporaire si vraiment nécessaire.
Les runners Apple permettent compilation/simulation, pas les mesures batterie.
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
