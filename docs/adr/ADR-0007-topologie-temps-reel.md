# ADR-0007 — Topologie temps réel et rôle de Redis

Statut : Acceptée
Date : 2026-09-15
Décision : mainteneur, validée par le propriétaire dans `TC-205`

## Contexte

La conception initiale annonçait Redis pour le Pub/Sub Socket.IO et la
présence. Le code n'a pourtant jamais intégré de client Redis ni d'adaptateur :
les rooms Socket.IO, la présence et les quotas WebSocket sont locaux au seul
processus Messaging. Le staging fonctionne avec une instance Messaging et ne
déploie aucune ressource Redis.

Le seul artefact restant était un ancien `redis.conf` qui écoutait toutes les
interfaces avec le mode protégé désactivé. Le conserver suggérait à tort une
fonctionnalité et une posture de sécurité qui n'existaient pas.

## Décision

La V1 utilise **une seule instance Messaging, sans Redis ni autre bus temps
réel**. PostgreSQL reste l'unique stockage serveur durable. La présence, la
frappe et les quotas locaux sont explicitement éphémères et non distribués.

Redis n'est pas un accélérateur obligatoire pour une instance Socket.IO : il
devient utile lorsqu'il faut relayer les événements entre plusieurs instances
ou partager des compteurs. Déployer une seconde instance Messaging est donc
interdit tant qu'une évolution dédiée n'a pas livré ensemble :

- un adaptateur Socket.IO distribué et testé ;
- l'affinité des sessions de polling au niveau du load balancer, ou une
  décision explicite de transport WebSocket uniquement ;
- présence, limites de connexion et quotas cohérents entre réplicas ;
- comportement de reprise déterministe lors de la perte d'un replica ou du
  bus ;
- réseau privé, identité dédiée, authentification, ACL minimales et gestion des
  secrets ;
- métriques, tests de charge, tests de panne et rollback vers un replica.

Le candidat privilégié pour ce futur prototype est l'adaptateur **Socket.IO
Redis Streams**, avec un service compatible dédié ; **Valkey** est préféré à
ce stade pour sa licence BSD-3-Clause. Ce choix futur reste conditionné à un
benchmark, une revue des versions/licences effectives et une nouvelle décision
avant déploiement. Redis Pub/Sub classique n'est pas le choix par défaut, car
une interruption du serveur Redis limite les événements aux clients du replica
local, alors que l'adaptateur Streams sait reprendre le flux après une coupure
temporaire.

## Options considérées

- **Déployer Redis immédiatement** : rejeté. Aucun consommateur n'existe et le
  service ajouterait mémoire, mises à jour, secrets, sauvegarde, supervision et
  modes de panne sans augmenter la capacité du processus Messaging unique.
- **Rester sur un replica jusqu'à saturation mesurée** : retenu. C'est la
  topologie la plus simple, la plus rapide et la moins exposée pour la V1.
- **Utiliser l'adaptateur PostgreSQL dès maintenant** : rejeté. Il n'apporte
  rien avec un replica, augmente la charge de la base durable et ne prend pas
  en charge la récupération d'état Socket.IO dans la version évaluée.
- **Ajouter directement Redis Pub/Sub** : reporté et non privilégié. Il relaie
  les broadcasts entre réplicas, mais ne résout ni l'affinité de session, ni le
  code de présence local, ni la perte temporaire des paquets lors d'une coupure
  Redis.

## Conséquences

- aucun aller-retour ni point de panne supplémentaire sur la connexion ou le
  chemin des messages de la V1 ;
- consommation mémoire et surface de maintenance réduites ;
- indisponibilité temps réel pendant le redémarrage de l'unique instance,
  compensée ultérieurement par la synchronisation durable de `TC-501` à
  `TC-508`, et non par la présence éphémère ;
- impossibilité assumée de monter horizontalement Messaging avant le chantier
  distribué ;
- les limites en mémoire ne constituent pas une protection globale dès que
  plusieurs processus existent ; le déploiement doit alors échouer ou être
  bloqué tant qu'un store partagé n'est pas configuré.

## Sécurité, données et rollback

Un adaptateur Redis/Streams considère le bus comme une infrastructure de
confiance : ses trames ne sont pas signées, chiffrées ni authentifiées par
l'adaptateur. Un futur service doit donc être inaccessible aux clients et aux
autres stacks, ne publier aucun port hôte et n'accepter qu'un utilisateur ACL
dédié aux clés/commandes/canaux nécessaires. TLS devient obligatoire si le flux
sort du réseau Docker ou traverse une frontière de confiance.

Aucun texte en clair, clé, jeton ou secret ne doit transiter dans les événements
temps réel. Les messages durables restent dans PostgreSQL ; le bus ne devient
jamais leur source de vérité. Le rollback du futur mode distribué repasse à un
replica Messaging, désactive l'adaptateur et conserve la reprise depuis le
curseur PostgreSQL.

`TC-205` supprime uniquement la configuration Redis inutilisée du dépôt. Aucun
conteneur, volume ou donnée de staging n'est supprimé.

## Critères de réexamen

Ouvrir une nouvelle décision si l'un des faits suivants est démontré :

- les tests `TC-806` dépassent les SLO de latence/reprise ou les plafonds CPU,
  mémoire, boucle événementielle ou connexions sur un replica correctement
  optimisé ;
- une exigence de disponibilité impose plusieurs instances simultanées ;
- le déploiement cible devient multi-hôte ;
- les versions, licences ou propriétés des adaptateurs candidats changent.

Ne pas utiliser un nombre arbitraire d'utilisateurs comme seuil : connexions
simultanées, fréquence des événements, taille des rooms et coût PostgreSQL sont
les mesures déterminantes.

## Références officielles vérifiées le 2026-09-15

- [déploiement Socket.IO sur plusieurs nœuds](https://socket.io/docs/v4/using-multiple-nodes/) ;
- [adaptateur Redis Socket.IO](https://socket.io/docs/v4/redis-adapter/) ;
- [adaptateur Redis Streams Socket.IO](https://socket.io/docs/v4/redis-streams-adapter/) ;
- [sécurité Redis](https://redis.io/docs/latest/operate/oss_and_stack/management/security/) ;
- [projet et licence Valkey](https://github.com/valkey-io/valkey).
