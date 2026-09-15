# Capacité et mise à l'échelle du temps réel

Statut : topologie V1 décidée par `ADR-0007`
Dernière mise à jour : 2026-09-15

## Topologie V1

La V1 exécute exactement un processus Messaging. Son adaptateur Socket.IO est
l'adaptateur mémoire par défaut. Les rooms, connexions, présences, indicateurs
de frappe, limites de connexions et quotas d'événements n'existent que dans ce
processus.

Redis n'est ni une base de messages, ni un cache de contenu, ni une dépendance
du chemin nominal. Les messages chiffrés et le futur curseur de reprise sont
durables dans PostgreSQL. Après une interruption du temps réel, le client doit
se resynchroniser depuis cette source durable ; une présence ou un événement de
frappe peut être perdu sans conséquence métier.

Cette topologie évite une connexion réseau et un composant critique
supplémentaires. Elle ne promet pas la haute disponibilité du WebSocket : un
redémarrage Messaging coupe les sockets, puis les clients se reconnectent.

Le client Flutter natif force actuellement le transport WebSocket. Il n'a donc
pas besoin d'affinité pour son propre chemin nominal. Le serveur conserve
cependant le polling Socket.IO et le smoke l'exerce : cette compatibilité reste
utile sur certains réseaux et pour tout futur client. Elle ne doit pas être
retirée sans tests réseau réels et décision de compatibilité.

## Ce que Redis changerait réellement

Un adaptateur distribué relaie un broadcast vers les clients raccordés aux
autres réplicas. Il ne réduit pas le coût de validation JWT/appareil, des ACL,
des écritures PostgreSQL ou du chiffrement client. Il ne distribue pas
automatiquement les `Map` applicatives de présence et de quotas.

Plusieurs serveurs Socket.IO exigent en outre que les requêtes de polling d'une
même session reviennent au même serveur. L'adaptateur Redis classique lui-même
ne fournit pas cette affinité. L'ajouter seul créerait donc une topologie
incorrecte.

## Mesures avant toute montée horizontale

`TC-207` doit exposer sans donnée personnelle au minimum :

- connexions Socket.IO actives et tentatives/refus ;
- taux d'événements et de broadcasts, rooms actives et taille agrégée ;
- durée des ACK et latence de la boucle événementielle ;
- CPU, mémoire, PID, redémarrages et saturation PostgreSQL ;
- reconnexions, erreurs de transport et rattrapages nécessaires.

`TC-806` doit ensuite charger une instance avec des comptes, appareils,
conversations, rooms et enveloppes synthétiques représentatifs. Il fixe les SLO
à partir des parcours produit, mesure p50/p95/p99 et conserve au moins 30 % de
marge soutenue sur la ressource qui sature la première. Tant que ces résultats
respectent les SLO, ajouter Redis ne constitue pas une optimisation justifiée.

### Dettes de présence à traiter avant la charge

L'implémentation actuelle de `presence.ts` conserve dans sa `Map` les
utilisateurs dont le dernier socket s'est déconnecté, avec un `Set` vide. Sa
mémoire peut donc croître avec le nombre d'utilisateurs distincts vus depuis le
dernier redémarrage. À chaque nouvelle connexion, elle relit aussi les groupes
de chaque autre utilisateur en ligne, ce qui ajoute un coût approximativement
linéaire et plusieurs requêtes PostgreSQL.

Redis ne corrige aucun de ces deux défauts. `TC-510` doit supprimer les entrées
vides, borner ou remplacer le fan-out de présence et couvrir le comportement
par des tests. Cette correction et l'instrumentation `TC-207` doivent précéder
la campagne de charge `TC-806`.

## Porte de passage à plusieurs réplicas

La montée horizontale forme un seul changement atomique. Elle n'est acceptable
que si les éléments suivants sont tous présents :

1. benchmark comparatif à un replica, puis deux réplicas avec panne injectée ;
2. adaptateur compatible avec la reprise exigée par `TC-505` ;
3. affinité de session testée sur polling, ou suppression mesurée et compatible
   du polling ;
4. présence et frappe bornées, non durables et cohérentes entre réplicas ;
5. quotas HTTP, Socket.IO et connexions distribués sans mode fail-open
   silencieux ;
6. service de bus dédié au projet, réseau interne sans port hôte, compte ACL et
   secret distincts, image figée et conteneur durci ;
7. aucune donnée sensible en clair dans les trames du bus ou ses journaux ;
8. readiness, métriques, alertes, sauvegarde si l'état de reprise l'exige et
   procédure de retour à un replica ;
9. tests de perte du bus, d'un replica, du proxy et de PostgreSQL ;
10. smoke multi-appareil vérifiant absence de perte durable et de doublon.

## Candidat technique

Le premier prototype doit comparer au minimum :

- Socket.IO Redis Streams sur Valkey dédié, candidat privilégié car il reprend
  un flux après une coupure temporaire et Valkey est distribué sous licence
  BSD-3-Clause ;
- adaptateur PostgreSQL, plus simple en nombre de services mais couplant les
  broadcasts à la base durable et sans récupération d'état Socket.IO dans la
  version examinée ;
- Redis Pub/Sub classique, uniquement comme référence de performance car une
  coupure limite alors les émissions aux clients du replica local.

Le résultat du prototype, les versions, licences, limites et budgets deviennent
une nouvelle ADR. `ADR-0007` n'autorise pas à déployer aujourd'hui un de ces
candidats.

## Exploitation actuelle

- nombre autorisé de réplicas Messaging : `1` ;
- dépendance Redis/Valkey : aucune ;
- état éphémère perdu au redémarrage : présence, frappe, rooms et quotas ;
- état durable à restaurer : PostgreSQL uniquement ;
- rollback d'un futur déploiement distribué : repasser à un replica et
  resynchroniser depuis PostgreSQL.
