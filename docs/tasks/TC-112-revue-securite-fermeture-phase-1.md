# TC-112 — Revue de sécurité de fermeture de la phase 1

Statut : Terminée — Go avec réserves ; portes TC-113/TC-114 encore ouvertes
Priorité : P0 gate
Décision : mainteneur, propriétaire pour toute acceptation de risque
Dépendances : `TC-101` à `TC-111` terminées, `TC-114` implémentée

## Objectif

Reprendre les invariants 1 à 20 et 26 à 28 contre le code réellement présent,
les tests et le staging. La revue doit chercher les contournements entre lots,
pas seulement relire les conclusions de chaque fiche.

La porte de sortie exige qu'aucune vulnérabilité critique ou haute exploitable
ne soit acceptée silencieusement et que les tests d'usurpation, accès croisé,
clé, appareil et remise de message restent négatifs.

## Périmètre

- Auth, Messaging, PostgreSQL, Socket.IO et gateway staging ;
- client Flutter : configuration, jetons, appareil, clés, messages et logs ;
- dépendances verrouillées, fichiers suivis et historique Git ;
- cohérence des contrats et documents de sécurité de phase 1.

## Critères d'acceptation

- [x] aucun secret réel ou fallback secret dans les fichiers suivis ;
- [x] access/refresh, identité JWT, preuves appareil et révocation restent stricts ;
- [x] ACL et transactions refusent les accès croisés et courses couvertes ;
- [x] entrées HTTP/Socket.IO bornées, proxy et quotas non contournables ;
- [x] aucun texte non authentifié n'atteint UI, cache ou notification ;
- [x] zéro avis npm critique/haut et aucun avis restant non documenté ;
- [x] suites Auth, Messaging et Flutter intégralement passantes ;
- [x] smoke adversarial PostgreSQL/Socket.IO passant sur la release courante ;
- [x] constats classés, risques résiduels et décisions de phase suivante écrits ;
- [x] conclusion explicite `Go`, `Go avec réserves` ou `No-Go`.

## Méthode et preuves

1. Rechercher secrets, URLs historiques, fallbacks, logs et chemins de
   déchiffrement alternatifs dans les fichiers suivis et l'historique utile.
2. Revoir la trace des invariants vers code et tests.
3. Refaire installations propres, audits et suites des trois composants.
4. Rejouer le smoke staging et inspecter santé, labels, redémarrages et logs.
5. Documenter chaque constat avec sévérité, scénario, impact et traitement.

## Risques et rollback

La revue est en lecture seule hors corrections explicitement rattachées à un
constat. Chaque correction reçoit ses tests et son propre commit. Aucun risque
critique ou haut ne peut être reporté par simple confort de planning.

La production est hors périmètre. `TC-113` conserve son rollback réseau
indépendant et ne devient terminée qu'après validation TLS et refus hors ACL.

## Résultat de la revue

Conclusion : **Go avec réserves** pour terminer les validations de Phase 1.
Aucune vulnérabilité critique ou haute exploitable n'a été trouvée dans le
périmètre revu. Cette conclusion n'autorise ni le passage en Phase 2, ni une
publication : `TC-113` doit encore fermer le chemin TLS et `TC-114` doit encore
recevoir ses mesures Android/Windows.

| Invariants | Résultat | Preuves principales |
|---|---|---|
| 1 à 5 — identité et sessions | Conforme P1 | configuration fail-closed, JWT Ed25519 strict, séparation refresh/access, réauthentification et tests Auth |
| 6 à 9 — autorisation | Conforme P1 | matrice ACL centralisée, routes négatives, transactions et smoke PostgreSQL à trois comptes |
| 10 à 12 et 14 — appareils, révocation, aléa | Conforme P1 | preuve de possession, approbation signée, liaison au token, rotation/révocation et vecteurs crypto |
| 13 — clés privées locales | Conforme au périmètre, réserve | aucune sortie en clair ; validation/renforcement du stockage par plateforme suivis par `TC-306` et `TC-703` |
| 15 à 19 — messages E2EE | Conforme P1 | enveloppe V2 authentifiée, `decryptVerified`, barrière `VerifiedMessageDelivery`, aucun texte avant effets |
| 20 — propriétés avancées | Conforme par non-revendication | absence de revendication forward secrecy/PCS ; protocole V3 et audit suivis par `TC-301` à `TC-312` |
| 26 — secret client partagé | Conforme | ancien mécanisme supprimé du client, des backends et du staging |
| 27 — configurations de build | Conforme pour staging, réserve release | URL/environnement injectés et validés ; signatures et identités stores relèvent de `TC-701` à `TC-707` |
| 28 — production | Conforme | aucune action production ; staging, sauvegardes et rollback séparés |

## Preuves exécutées le 2026-09-12

- installation propre `npm ci`, compilation et suites : Auth `27/27`,
  Messaging `90/90` ;
- `npm audit` avec et sans dépendances de développement : zéro vulnérabilité
  dans les deux backends ;
- dernière suite Flutter disponible : `45/45`, plus analyse sans erreur de
  compilation ; le SDK Flutter n'est pas installé sur la VM de contrôle pour
  une seconde exécution identique ;
- release staging `e6dce1bfe3920fd91621acf0875a25e89a4d4731` : quatre
  services sains, zéro redémarrage, aucune occurrence
  `fatal|panic|uncaught|unhandled` dans la fenêtre inspectée ;
- smoke adversarial complet passé sur cette release après déploiement ;
- scan Git courant : zéro `.env`, clé privée, ancienne URL runtime, secret
  applicatif partagé ou fallback JWT suivi ;
- le seul motif de fallback remonté par le scan est l'URL publique paramétrable
  du smoke staging, pas une valeur secrète.

## Constats et risques résiduels

| Sévérité | Constat | Décision |
|---|---|---|
| Moyenne | Le secret applicatif public retiré par `TC-109` demeure récupérable dans l'historique Git. | Le considérer définitivement compromis, ne jamais le réutiliser ; aucune configuration active ne l'accepte. Une réécriture d'historique n'apporterait pas de propriété de sécurité supplémentaire. |
| Moyenne | Les comptes/privilèges PostgreSQL et le conteneur PostgreSQL ne sont pas encore au moindre privilège final. | Traitement obligatoire dans `TC-203`/`TC-204`. |
| Moyenne | Le stockage sécurisé des clés dépend encore des implémentations de plateforme et Windows n'est pas validé. | Traitement dans `TC-306` et `TC-703`, avant toute release desktop. |
| Faible | Les logs debug contiennent encore de nombreux identifiants techniques et métadonnées, mais aucun texte clair, jeton ou clé détecté dans les chemins revus. | Réduction, structuration et redaction dans `TC-206`; ne pas activer les logs debug en release. |
| Information | Deux anciens fichiers de l'historique contiennent des chaînes d'encodage PEM, sans matériel de clé privée embarqué. | Aucun traitement requis ; conserver le contrôle de secret en CI dans `TC-805`. |

Les réserves ci-dessus ne constituent pas une acceptation silencieuse : elles
sont rattachées à des tâches obligatoires avant publication. Toute apparition
d'un secret actif, d'un texte non authentifié ou d'un contournement ACL ferait
repasser immédiatement la conclusion à `No-Go`.
