# Inventaire du staging backend

Statut : opérationnel, publication TLS restreinte, rôles DB et conteneurs durcis
Dernier déploiement : 2026-09-14 (`TC-204` terminée)
Environnement : LXC106, stack Compose `trust-circle-staging`

## Résumé

Le staging backend est une installation neuve et isolée des anciennes ressources supprimées. Il est destiné aux builds, smoke tests et futurs tests d'intégration automatisés. Il n'est pas un environnement de production ; son domaine TLS est publié derrière une ACL NPM limitée aux VPN et appareils explicitement autorisés.

## Release

| Élément | Valeur assainie |
|---|---|
| Commit source | `079263be9dfa1304e36d9f24b526d138666a79ab` |
| Release | `/opt/trust-circle-staging/releases/079263be9dfa1304e36d9f24b526d138666a79ab` |
| Pointeur actif | `/opt/trust-circle-staging/current` |
| Fichier de secrets | `/opt/trust-circle-staging/shared/staging.env`, mode `0600` |
| Secrets DB | répertoire frère `staging.env.d`, mode `0700`, quatre fichiers distincts |
| Source Compose | `deploy/staging/compose.yml` |
| Projet Compose | `trust-circle-staging` |

Le fichier de secrets n'est pas versionné et ses valeurs n'ont pas été affichées pendant le déploiement.

## Services

| Service | Image | Preuve | État final |
|---|---|---|---|
| Auth | `trust-circle-staging-auth:staging-079263be9dfa` | image ID `a27009163119`, label revision complet | sain, 0 redémarrage |
| Messaging | `trust-circle-staging-messaging:staging-079263be9dfa` | image ID `b5a7f8fab4ac`, label revision complet | sain, 0 redémarrage |
| PostgreSQL | `postgres:16-alpine` résolue par digest | image ID `75f5a96988cd` | sain, 0 redémarrage |
| Bootstrap rôles | même image PostgreSQL par digest | image ID `75f5a96988cd`, utilisateur `postgres` | terminé, code 0 |
| Migration | Sqitch 1.6.1 résolue par digest | image ID `44f627f9a86a`, utilisateur `sqitch` | terminé, code 0 |
| Gateway | `nginx:stable-alpine` résolue par digest | image ID `6e01bfae6f79` | sain, 0 redémarrage |

Les références tierces exactes observées au déploiement sont :

- PostgreSQL : `postgres@sha256:cf78e76683b9ca8c5733cbbdce6c9262b45b6767934dd0a95e671f9a0fc20685` ;
- Nginx : `nginx@sha256:97d490c12ba55b4946b01546d1c3ed324e8d41ab1c9fcb2a616aa470620e5b46` ;
- Sqitch : `sqitch/sqitch@sha256:f247ab0e0b66e9c2d09a400864f7314358893f5cf209cddcc4f213f7d5bfe4d3`.

## Isolation

- Gateway : `10.0.20.20:18081`, filtrée sur l'hôte pour NPM
  `10.0.10.20/32` uniquement ; aucun bind `0.0.0.0` ni ancien loopback
  simultané.
- Auth et messaging : aucune publication de port hôte.
- PostgreSQL : aucune publication de port hôte, réseau interne `trust-circle-staging-data`.
- Migration : aucune publication de port, réseau `trust-circle-staging-data`
  uniquement ; elle termine avant le démarrage des backends.
- Réseaux : `trust-circle-staging-edge` en `172.30.108.0/24` avec gateway
  `.10`, Auth `.11` et Messaging `.12`, plus `trust-circle-staging-data`.
- Volume : `trust-circle-staging-postgres-data`.
- Aucun domaine, certificat, volume, réseau ou secret historique réutilisé.
- Aucun e-mail ou fournisseur push configuré.
- Redis absent car non utilisé par le code.

Les tests backend sont exécutés via `pct exec 106` et la gateway loopback. Toute exposition LAN/Internet exige une décision séparée après la fermeture des vulnérabilités Phase 1.

## Durcissement appliqué

Les six conteneurs et jobs déclarent un utilisateur non-root explicite, un
rootfs en lecture seule, `no-new-privileges`, aucune capability et des limites
CPU, mémoire et PID. PostgreSQL n'écrit que dans son volume nommé et ses tmpfs
bornés. Auth, Messaging et Gateway n'écrivent que dans leurs tmpfs ; les
écritures de contrôle sur leur rootfs, comme sur celui de PostgreSQL, sont
effectivement refusées. Le job bootstrap masque en lecture seule le `VOLUME`
inutilisé de l'image PostgreSQL et ne laisse donc aucun volume anonyme.

## Schéma et données

- Base PostgreSQL 16 recréée à vide pendant `TC-202`.
- Schéma construit exclusivement par le plan Sqitch ; `init.sql` n'est plus
  monté ni exécuté.
- 17 tables publiques observées ; `user_groups.role` reste contraint à `admin` ou `member`, et le propriétaire reste dérivé de `groups.creator_id`.
- Aucune donnée métier persistante après `TC-202` ; les fixtures synthétiques
  du smoke final ont été supprimées après validation.
- Sept changements sont enregistrés dans `trust_circle_sqitch`. Les anciens
  scripts manuels restent des archives d'audit non exécutées.

Le redéploiement `TC-203` du 2026-09-14 a validé :

1. recréation explicitement autorisée du volume staging ne contenant aucune
   donnée métier, sans modification d'une autre stack ou ressource Docker ;
2. quatre mots de passe PostgreSQL aléatoires de 256 bits, distincts et hors du
   fichier d'environnement, avec fichiers montés en lecture seule ;
3. séparation de `trust_circle_admin`, `trust_circle_migrator`,
   `trust_circle_auth` et `trust_circle_messaging`, objets appartenant au
   migrateur sans attribut d'administration ;
4. septième changement Sqitch versionnant les privilèges runtime, tests réels
   des commandes permises/refusées et absence d'accès runtime au registre
   Sqitch ou au DDL ;
5. absence de `DATABASE_URL`, `PGPASSWORD` ou mot de passe DB dans
   `Config.Env`, Auth et Messaging ne recevant chacun que leur propre fichier ;
6. test jetable complet avec deux migrations concurrentes, réversion totale,
   redéploiement et smoke PostgreSQL/HTTP/Socket.IO réussis ;
7. staging final sur `190abbce96a57c4714ad5501908d39cb26cefb6a`,
   smoke adversarial réussi, 17 tables vidées table par table et sept entrées
   Sqitch conservées ;
8. quatre services persistants sains et sans redémarrage, jobs bootstrap et
   migration en code `0`, accès direct depuis NPM et HTTPS tous deux en `200`.

Les configurations précédentes sont conservées en mode `0600` sous
`staging.env.before-2e74b5446555` et `staging.env.before-190abbce96a5`. Les
releases `bb4ce6da93839d9db253e3505d41060023416006` et
`2e74b544655549b3253bf4dbfd04798beb5d07c6` restent disponibles. Le rollback
vers le schéma antérieur nécessite une nouvelle recréation du volume vide ;
aucune donnée métier n'est à restaurer.

Le redéploiement `TC-204` du 2026-09-14 a ensuite validé :

1. images Auth et Messaging finales exécutées par `node`, base par `postgres`,
   bootstrap par `postgres`, migration par `sqitch` et gateway par `101:101` ;
2. pour les six composants, rootfs en lecture seule, `no-new-privileges`,
   suppression de toutes les capabilities et limites CPU/mémoire/PID non
   nulles ;
3. refus réel des écritures hors montages autorisés sur les quatre services
   persistants, puis persistance PostgreSQL sur le même volume après
   redémarrage ;
4. initialisation jetable, sept migrations et vérifications Sqitch, réversion
   totale, nouveau déploiement, tests de privilèges et smoke adversarial tous
   réussis ;
5. `27/27` tests Auth, `90/90` tests Messaging et zéro avis dans les deux
   audits npm ; l'analyse SBOM/CVE des images reste prévue par `TC-209` et
   `TC-805` ;
6. staging final sur `079263be9dfa1304e36d9f24b526d138666a79ab`,
   quatre services sains sans redémarrage et deux jobs terminés en code `0` ;
7. date de création du volume nommé inchangée
   (`2026-09-14T18:34:16+02:00`), aucun volume anonyme résiduel, sept
   changements Sqitch et zéro ligne dans chacune des 17 tables publiques ;
8. zéro réponse 5xx Auth/Messaging dans la fenêtre finale, et les trois routes
   de santé en `200` depuis NPM en accès direct comme via HTTPS.

Les configurations précédentes sont conservées en mode `0600` sous
`staging.env.before-c2d388a16bb0` et `staging.env.before-079263be9dfa`. Les
releases `190abbce96a57c4714ad5501908d39cb26cefb6a` et
`c2d388a16bb0c5381904c4e05371936866a43db0` restent disponibles pour rollback
applicatif sans suppression du volume PostgreSQL.

Le redéploiement `TC-202` du 2026-09-13 a validé :

1. abandon explicitement autorisé des seules données synthétiques, après
   confirmation de l'unique consommateur du volume ;
2. recréation du volume exact `trust-circle-staging-postgres-data`, sans toucher
   aux autres stacks, volumes, réseaux ou secrets ;
3. six changements Sqitch et 17 tables publiques sur base vide, avec zéro
   donnée métier avant smoke ;
4. job non-root, en lecture seule, sans capability et limité au réseau data ;
5. `check`, six `verify`, assertions de catalogue et deux déploiements sans
   effet réussis ;
6. smoke adversarial TC-111 réussi, puis suppression de toutes ses fixtures et
   vérification de zéro ligne dans chacune des 17 tables publiques ;
7. quatre services sains, zéro redémarrage et aucun log Auth/Messaging de
   niveau erreur/fatal ;
8. réponse HTTP 200 depuis NPM sur le seul port autorisé `18081`.

## Validations exécutées

1. Validation Compose avec sortie silencieuse.
2. Build des deux images backend depuis le commit enregistré.
3. Healthchecks PostgreSQL, auth, messaging et gateway.
4. Inscription et connexion d'un compte `example.invalid` synthétique.
5. Appel authentifié `/auth/me`.
6. Rejet HTTP 403 d'un mauvais `x-app-secret`.
7. Création puis lecture d'un cercle synthétique.
8. Handshake Socket.IO par polling.
9. `docker compose down` puis `up` sans suppression de volume.
10. Vérification que les comptages utilisateurs/cercles sont identiques avant/après reprise.
11. Nouvelle exécution complète des smoke tests après reprise.

Tous ces tests ont réussi le 2026-08-23.

Le redéploiement `TC-101` du 2026-08-24 a en plus validé :

1. build des images Auth et Messaging avec la configuration centralisée ;
2. arrêt avec code `1` de chaque image lancée sans configuration critique ;
3. conservation du fichier privé en mode `0600`, sans affichage de valeur ;
4. healthchecks des quatre services et smoke test fonctionnel complet après remplacement des conteneurs ;
5. traçabilité du commit dans les labels des deux images.

La release précédente et un instantané privé de la configuration antérieure au changement des métadonnées de release sont conservés sur le LXC pour rollback. Les secrets applicatifs eux-mêmes n'ont pas été changés.

Le redéploiement `TC-102` du 2026-08-24 a ensuite validé :

1. migration du nom de la clé access et génération d'une clé refresh séparée, sans afficher de valeur ;
2. présence des noms `JWT_ACCESS_SECRET` et `JWT_REFRESH_SECRET` dans Auth, et de la seule clé access dans Messaging ;
3. contrat strict HS256/issuer/audience/type/version/temps par 26 tests automatisés ;
4. refus REST du refresh token dans Auth et Messaging, refus access sur refresh/logout, révocation effective et refus Socket.IO couvert par test automatisé ;
5. refus HTTP 401 d'un JWT au format historique malgré la conservation de la matière de clé access ;
6. healthchecks des quatre services et smoke test complet après redéploiement.

Le durcissement asymétrique final de `TC-102` a en plus validé :

1. génération sans affichage d'une paire Ed25519 dédiée au staging ;
2. présence de la clé privée, de la clé publique et du secret refresh dans Auth, contre la seule clé publique dans Messaging ;
3. impossibilité effective de signer un access token depuis le conteneur Messaging ;
4. coût moyen dans le conteneur Auth de 0,0773 ms par signature et 0,1499 ms par vérification sur 2 000 opérations, sous le budget de 2 ms ;
5. healthchecks des quatre services et smoke test strict access/refresh après remplacement des conteneurs.

La paire access a été renouvelée, ce qui invalide volontairement les access tokens antérieurs. La configuration privée immédiatement antérieure est conservée en mode `0600` sous `staging.env.before-e7be1b027923`, et les releases précédentes restent disponibles pour rollback du staging.

Le redéploiement `TC-103` du 2026-08-24 a enfin validé :

1. build des images Auth et Messaging depuis le commit `8ebeaa30f243a010d22070b8de20d969adedba89` et traçabilité de cette révision dans leurs labels ;
2. healthchecks des quatre services ;
3. smoke test complet, incluant deux comptes synthétiques et le refus HTTP 403 d'une enveloppe dont le `sender.userId` ne correspond pas au token ;
4. conservation de la paire Ed25519 existante et de la séparation des secrets établie par `TC-102` ;
5. coût moyen de la dérivation typée de l'identité de 0,000125 ms sur 500 000 appels dans Messaging, sans réseau ni base.

La configuration immédiatement antérieure au changement de métadonnées est conservée en mode `0600` sous `staging.env.before-8ebeaa30f243`. La release `e7be1b027923a7868cca3145694e9bcc27217332` reste disponible pour rollback applicatif sans restauration de données.

Le redéploiement `TC-104` du 2026-08-25 a ensuite validé :

1. montée et descente de `20260825_001_group_member_role` dans un schéma isolé, avec conservation des appartenances et rejet d'un rôle invalide ;
2. sauvegarde PostgreSQL préalable vérifiée `pre-tc104-20260825T110719Z.dump`, conservée en mode `0600` dans le répertoire privé de sauvegardes du staging ;
3. application de la migration réelle et présence d'une unique colonne et contrainte de rôle, sans ligne invalide ;
4. build et déploiement des images Auth/Messaging depuis `f0e1baa7db2cd9c0e0cfd1104f477af25eec5b9f`, avec labels de révision correspondants ;
5. healthchecks des quatre services, zéro redémarrage des services applicatifs et aucun log Messaging de niveau erreur observé dans la fenêtre post-déploiement ;
6. deux smoke tests complets, dont le second avec trois comptes synthétiques : refus d'accès à l'annuaire hors cercle, création de conversation interdite sans écriture, décision d'adhésion par propriétaire puis administrateur, refus au membre simple et au non-propriétaire, vote neutralisé et poignée de main Socket.IO réussie.

La configuration précédente est conservée en mode `0600` sous `staging.env.before-f0e1baa7db2c`. La release `8ebeaa30f243a010d22070b8de20d969adedba89` reste disponible pour rollback applicatif ; la migration descendante a été exercée isolément avant le déploiement.

Le redéploiement `TC-105` du 2026-08-25 a ensuite validé :

1. montée et descente de `20260825_002_unique_pending_join_request` dans un schéma isolé, avec rejet du second doublon `pending` en montée et insertion de contrôle possible après descente ;
2. absence de doublon préalable puis sauvegarde PostgreSQL vérifiée `pre-tc105-20260825T123518Z.dump`, conservée en mode `0600` dans le répertoire privé de sauvegardes ;
3. application réelle de l'index partiel, sans suppression ni réécriture de donnée ;
4. build et déploiement des images Auth/Messaging depuis `abf6b51abf2967b7ddd0d43020690b0fc4872e8c`, avec labels de révision correspondants ;
5. healthchecks des quatre services, zéro redémarrage et aucun log de niveau erreur observé dans les quatre services après déploiement ;
6. smoke test complet réussi en 2 secondes : conversation, accusé de lecture et message réels, double demande concurrente donnant `201/409`, double décision donnant `200/403`, course publication/révocation terminant avec la clé `revoked`, puis refus de republier et d'envoyer depuis cet appareil ;
7. cohérence SQL finale : aucun cercle sans appartenance créateur, aucune conversation sans participant créateur et aucune demande acceptée sans appartenance ou clé d'appareil.

La configuration précédente est conservée en mode `0600` sous `staging.env.before-abf6b51abf29`. La release `f0e1baa7db2cd9c0e0cfd1104f477af25eec5b9f` reste disponible pour rollback applicatif ; l'application précédente est compatible avec l'index et la migration descendante a été exercée isolément.

Le redéploiement du lot B de `TC-106` du 2026-08-25 a ensuite validé :

1. sauvegarde PostgreSQL préalable vérifiée `pre-tc106-20260825T140433Z.dump`, mode `0600`, 32 389 octets et SHA-256 `dd5297a507ddbce9e02cddff305eafbd2a7a53ab336ca9d19188bd24d5dbb01c` ;
2. restauration de cette sauvegarde dans une base isolée, montée de `20260825_003_account_device_trust` avec trois tables/trois index, descente complète, conservation de la baseline puis suppression de la base isolée ;
3. migration additive de la base réelle sans réécriture des données existantes, puis build et déploiement du commit final `6450722344286341da0f9826dc080c35b6dc7f2d` ;
4. détection par le premier smoke réel d'une comparaison PostgreSQL ambiguë `uuid/text`, correction avec casts explicites, nouveau commit immuable et redéploiement sans recréer PostgreSQL ;
5. healthchecks des quatre services, zéro redémarrage et aucun log Auth/Messaging de niveau erreur dans la fenêtre suivant le déploiement final ;
6. smoke test historique complet, puis parcours réel de confiance : réauthentification, grant court, preuve Ed25519, rejet du rejeu, premier appareil `active`, second `pending`, refus d'un bootstrap avec access token seul et registre limité au sujet ;
7. cohérence SQL finale : zéro clé, transcription ou nonce de taille invalide, zéro transition d'état incohérente, zéro compte avec plusieurs appareils actifs et aucune base de test résiduelle.

Les configurations antérieures sont conservées en mode `0600` sous
`staging.env.before-060a293205aa` et `staging.env.before-645072234428`. La
release `abf6b51abf2967b7ddd0d43020690b0fc4872e8c` reste disponible pour
rollback applicatif et ne dépend d'aucune table ajoutée ; la migration
descendante a été exercée sur la restauration isolée avant la migration réelle.

Le redéploiement du lot C de `TC-106` du 2026-08-25 a ensuite validé :

1. sauvegarde PostgreSQL préalable vérifiée
   `pre-tc106-lotc-20260825T193057Z.dump`, mode `0600`, 46 785 octets et
   SHA-256 `524b1b463d77d5bba99e884fce7369f067fbacbbae7f911d1185f07f3adc3e89` ;
2. restauration dans `tc106_lotc_migration_test`, montée de
   `device_approval_challenges` avec une table, deux index et quatorze
   contraintes, descente complète, conservation de la baseline et suppression
   de la base isolée ;
3. migration additive de la base réelle, puis build et déploiement du commit
   `0a6e7a0062c0c8fd8ca57f2dd78a15989a4b27a4`, avec labels de révision
   correspondants ;
4. quatre healthchecks sains, zéro redémarrage et zéro ligne `error|fatal`
   Auth/Messaging dans la fenêtre post-déploiement ;
5. smoke historique complet puis parcours réel : bootstrap, preuve Ed25519,
   appareil suivant `pending`, approbation signée, rejeu refusé, troisième
   appareil refusé par signature et registre final `active,active,revoked` ;
6. cohérence SQL finale : zéro taille/état incohérent, zéro challenge ouvert
   visant une cible non `pending`, zéro résultat hors vocabulaire et aucune base
   de migration résiduelle.

La configuration précédente est conservée en mode `0600` sous
`staging.env.before-0a6e7a0062c0`. La release
`6450722344286341da0f9826dc080c35b6dc7f2d` reste disponible pour rollback
applicatif et ignore sans erreur la table additive du lot C.

Le redéploiement du lot D de `TC-106` du 2026-08-28 a ensuite validé :

1. sauvegarde PostgreSQL préalable
   `pre-tc106-lotd-20260828T200545Z.dump`, mode `0600`, 55 653 octets et
   SHA-256 `037f05683ada6b5aec700463ecbc456233e0d0f76a6afc0d68918963f6c95a9b` ;
2. restauration dans `tc106_lotd_migration_test`, montée avec une table
   d'historique, quatre colonnes et cinq contraintes nommées, puis descente
   vers la baseline exacte `29 utilisateurs / 11 clés / 2 challenges /
   4 messages` et suppression de la base isolée ;
3. détection avant migration réelle de deux défauts de rollback — conservation
   de l'état historique et ordre de suppression des contraintes — corrigés et
   rejoués avec succès sur la restauration ;
4. courte fenêtre d'arrêt Auth/Messaging/Gateway, migration transactionnelle de
   la base réelle, conversion de sept anciennes clés en `legacy`, aucune clé
   `active` incomplète, puis déploiement de la release finale
   `9214b0a342cbcfccde4c6ed4fab04ec115d5311b` ;
5. correction révélée par le smoke d'un écart contractuel : la création de
   conversation renvoie désormais `201 Created`, protégée par un test backend ;
6. parcours final réussi : bearer seul refusé, preuve d'accès signée,
   isolation `pending`, approbation/refus, publications signées, rejeu
   idempotent, rotation et historique, refus d'une version obsolète, course
   publication/révocation globale, blocage immédiat et anciens messages encore
   accessibles ;
7. quatre healthchecks sains, labels correspondant au commit final, zéro
   redémarrage et zéro ligne Auth/Messaging `error|fatal` dans la fenêtre du
   dernier déploiement ;
8. neuf contrôles SQL finaux à zéro : tailles/états invalides des appareils et
   challenges, clés courantes/historiques invalides, clé active d'un appareil
   révoqué, historique non monotone, version destinataire invalide et base de
   migration résiduelle.

Les configurations précédentes sont conservées en mode `0600` sous
`staging.env.before-7d0d3afdbdfa`, `staging.env.before-2c79c0cbb79c` et
`staging.env.before-9214b0a342cb`. Les releases
`7d0d3afdbdfaf458146e1e63df3f69520662bb20` et
`2c79c0cbb79c46cd808cec3759766c8445bda69d` restent disponibles pour
rollback applicatif ; la descente SQL a été exercée uniquement sur la
restauration isolée.

Le redéploiement `TC-107` du 2026-09-08 a ensuite validé :

1. build et déploiement des images Auth/Messaging depuis le commit immuable
   `9ffc84f36e47aee5d86eb03f14307c93f5ef02dd`, avec labels de révision
   correspondants ;
2. quatre healthchecks sains, zéro redémarrage et aucune ligne Auth/Messaging
   de niveau `error` ou `fatal` après déploiement ;
3. maintien intégral du smoke de confiance appareil `TC-106` ;
4. rejet `400` des propriétés inconnues, doublons de participants, pages hors
   borne et chiffrés dépassant réellement 64 Kio après décodage Base64 ;
5. rejet `413` des corps dépassant 16 Kio pour Auth et 256 Kio pour
   Messaging, via la gateway réelle ;
6. absence de migration et de changement du volume PostgreSQL.

La configuration antérieure est conservée en mode `0600` sous
`staging.env.before-9ffc84f36e47`. La release
`9214b0a342cbcfccde4c6ed4fab04ec115d5311b` reste disponible pour rollback
applicatif sans restauration de données.

Le redéploiement `TC-108` du 2026-09-09 a ensuite validé :

1. recréation des deux réseaux propres au projet, sans `--volumes`, avec
   conservation du volume PostgreSQL et IP edge fixes `.10`, `.11`, `.12` ;
2. confiance Auth/Messaging limitée au CIDR `172.30.108.10/32` et remplacement
   par Nginx de toute chaîne `X-Forwarded-For` entrante ;
3. absence d'en-tête CORS permissif pour une origine inconnue, refus `403` du
   handshake Socket.IO portant cette origine et passage du client natif sans
   `Origin` ;
4. parcours réel avec compte et appareil synthétiques, preuve Ed25519,
   connexion Socket.IO par polling et ACK positif de `conv:subscribe` ;
5. quatre services sains, labels sur le commit
   `054eabdf65624d4c5db654742ba7ddf77e88a4cc`, zéro redémarrage et zéro
   correspondance sévère dans les logs Auth, Messaging et Gateway ;
6. sur quarante appels de santé par service via la gateway : Auth moyenne
   `1,074 ms`, maximum `1,604 ms`, Messaging moyenne `1,069 ms`, maximum
   `1,666 ms` ; aucun aller-retour applicatif n'a été ajouté ;
7. absence de migration ou changement de schéma. Les suites locales comptent
   28 tests Auth, 91 Messaging et 38 Flutter tous réussis.

La configuration précédant la frontière réseau est conservée en mode `0600`
sous `staging.env.before-2ae191d79223`; celle précédant le smoke ACK final est
sous `staging.env.before-054eabdf6562`. La release
`9ffc84f36e47aee5d86eb03f14307c93f5ef02dd` reste le rollback complet
pré-`TC-108`, sans restauration de données.

Le redéploiement `TC-109` du 2026-09-09 a ensuite validé :

1. retrait du secret partagé dans Flutter, Auth, Messaging, Socket.IO, CORS,
   Compose, le générateur et le fichier privé actif du staging ;
2. inscription, connexion puis refresh réels sans header caché, avec access
   token renouvelé utilisé pour le reste du parcours ;
3. refus `401` d'une route Messaging sans access token puis d'un refresh token
   présenté comme access token ;
4. preuve Ed25519 d'appareil, opérations cercle/message et ACK Socket.IO réels
   sans secret partagé, tout en conservant les tests négatifs de token, preuve
   et état d'appareil ;
5. quatre services sains, labels sur le commit
   `a55d8c5ecda649bb29096ea0f4301ad7bd14e888`, zéro redémarrage et aucune
   correspondance `error|fatal|panic` dans la fenêtre post-déploiement ;
6. sur quarante sondes via la gateway : Auth moyenne `1,110 ms`, maximum
   `1,713 ms`, Messaging moyenne `1,110 ms`, maximum `1,619 ms` ; aucun appel
   ni geste utilisateur n'a été ajouté au fonctionnement de l'application ;
7. absence de migration ou changement de schéma. Les suites locales comptent
   27 tests Auth, 90 Messaging et 39 Flutter tous réussis.

La configuration privée antérieure au retrait est conservée en mode `0600`
sous `staging.env.before-19aa30d0d087`; l'instantané nettoyé précédant le smoke
final est sous `staging.env.before-a55d8c5ecda6`. La release
`054eabdf65624d4c5db654742ba7ddf77e88a4cc` reste le rollback complet
pré-`TC-109`, sans restauration de données.

Le redéploiement `TC-111` du 2026-09-12 a ensuite validé :

1. `27/27` tests Auth et `90/90` tests Messaging sans réseau externe ;
2. parcours black-box de trois comptes et appareils synthétiques sur Nginx,
   Auth, Messaging, Socket.IO et PostgreSQL réels ;
3. refus des access absents, refresh employés comme access, preuves d'appareil
   altérées, appareils pending/révoqués et expéditeurs forgés ;
4. isolation croisée des cercles, membres, conversations, messages et clés,
   puis matrice propriétaire/administrateur/membre sur les demandes et rôles ;
5. relecture après refus des collections PostgreSQL exposées par l'API pour
   confirmer l'absence d'écriture, complétée par les assertions unitaires
   d'absence d'événement avant commit/après rollback ;
6. maintien du quota d'inscription à trois par heure : le test a été rendu
   compatible sans relever ni contourner cette limite ;
7. quatre services sains, labels sur
   `1aeaccf31f13c31ad58ab9c332a5d4f0140c8b76`, zéro redémarrage et aucun
   `fatal|panic|uncaught` dans la fenêtre post-déploiement.

Les configurations antérieures sont conservées en mode `0600` sous
`staging.env.before-d6da1cfa1423` et `staging.env.before-1aeaccf31f13`. La
release `a55d8c5ecda649bb29096ea0f4301ad7bd14e888` reste le rollback complet
pré-`TC-111`; aucune migration n'a été appliquée.

Le redéploiement `TC-110` du 2026-09-12 a ensuite validé :

1. construction des deux backends avec Fastify `5.12.4`, `bcrypt` `6.0.0`,
   Socket.IO `4.8.3` et zéro avis npm, dépendances de développement incluses ;
2. conservation des suites Auth `27/27`, Messaging `90/90` et du smoke
   adversarial PostgreSQL/Socket.IO complet de `TC-111` ;
3. quatre services sains, labels sur le commit
   `68e324c71758d3843371904f0be8a8201b09a389`, zéro redémarrage et zéro
   correspondance `fatal|panic|uncaught|unhandled` après déploiement ;
4. sur quarante sondes via la gateway : Auth moyenne `1,679 ms`, maximum
   `5,020 ms`, Messaging moyenne `1,536 ms`, maximum `3,448 ms` ;
5. absence de migration, changement de volume ou rotation de secret.

La configuration précédente est conservée en mode `0600` sous
`staging.env.before-68e324c71758`. La release
`1aeaccf31f13c31ad58ab9c332a5d4f0140c8b76` reste le rollback applicatif
pré-`TC-110`, sans restauration de données.

Le redéploiement préparatoire `TC-113` du 2026-09-12 a ensuite validé :

1. build et déploiement Auth/Messaging depuis
   `e6dce1bfe3920fd91621acf0875a25e89a4d4731` ;
2. passage du gateway de `127.0.0.1:18080` à l'adresse interne exacte
   `10.0.20.20:18081`, sans exposition des autres services ;
3. installation d'un service de filtrage persistant dans `DOCKER-USER`,
   autorisant uniquement NPM `10.0.10.20/32` et l'hôte sur ce port ;
4. refus confirmé depuis un autre LXC du VLAN et compteur de rejet incrémenté ;
5. smoke complet via l'adresse interne, quatre conteneurs sains, zéro
   redémarrage et aucun log sévère dans la fenêtre inspectée ;
6. sauvegarde préalable de NPM et de la configuration privée staging en mode
   `0600`, avec contrôle d'intégrité SQLite réussi.

La fermeture de `TC-113` a ensuite validé :

1. deux règles OPNsense journalisées et appairées, avant les blocages VLAN10 et
   VLAN20, limitées à `TCP 10.0.10.20/32 → 10.0.20.20:18081` ;
2. passage depuis NPM vers `/healthz`, `/health/auth`, `/health/messaging` et le
   handshake Socket.IO, tous en `200` ;
3. proxy NPM `85` pour `trust-circle.kavalek.fr`, upstream
   `http://10.0.20.20:18081`, certificat wildcard `4` et ACL `1` ;
4. redirection HTTP vers HTTPS, HSTS, HTTP/2, WebSocket et protection NPM des
   exploits actifs ;
5. refus `403` depuis LXC101 et LXC113, absents de l'ACL, et maintien du refus
   local pour toute source autre que NPM ;
6. smoke adversarial complet `TC-111` via le domaine HTTPS ;
7. quatre conteneurs toujours sains et sans redémarrage après les tests ;
8. sauvegardes NPM immédiatement antérieures sous
   `/root/backups/trust-circle-staging/20260912T193948Z/`, et sauvegardes
   OPNsense avant/après sous
   `/root/homelab/sauvegardes/incidents/tc113-opnsense-20260912/`.

## Limites assumées

- Le domaine staging est volontairement inaccessible hors de l'ACL NPM ; ce
  refus ne doit pas être confondu avec une panne du backend.
- Configuration de build Flutter staging validée par `TC-114` sur Windows 11
  physique et Android 16 émulé, avec TLS et budgets profile conformes.
- Sqitch est opérationnel et les rôles PostgreSQL sont séparés. Les sauvegardes
  automatisées et les tests périodiques de restauration restent à réaliser dans
  `TC-208`.
- Les scénarios d'autorisation croisée cercle/conversation/clé sont couverts
  par `TC-111` et le smoke adversarial courant.
- Images backend locales non publiées dans un registre ; l'image ID et les labels assurent la traçabilité locale, pas une provenance distante.
- Le LXC reste partagé et privilégié.

## Commandes de référence

Le déploiement, l'arrêt conservant les données et les smoke tests sont décrits dans `deploy/staging/README.md`. Ne jamais afficher la configuration Compose résolue ni le fichier d'environnement.
