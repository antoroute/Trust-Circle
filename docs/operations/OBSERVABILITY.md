# Santé et observabilité applicative

Statut : contrat implémenté par `TC-207`
Dernière mise à jour : 2026-09-29

## Contrats de santé

Auth et Messaging exposent trois contrats distincts sur leur réseau Docker
privé :

| Route | Sens | Dépendance PostgreSQL | Usage |
|---|---|---:|---|
| `/live` | le processus Node répond | non | diagnostic de vivacité |
| `/ready` | le service peut traiter une requête | oui | healthcheck Docker et gateway |
| `/health` | alias historique de vivacité `{ "ok": true }` | non | compatibilité temporaire |

La vérification `/ready` exécute uniquement `SELECT 1` dans un pool dédié d'une
connexion maximale. La connexion et la requête ont chacune un délai de
1 000 ms. Une panne retourne seulement HTTP `503` et
`{ "status": "not_ready" }` : aucun hôte, rôle, message PostgreSQL ou secret
n'est renvoyé ni journalisé.

Le pool dédié évite qu'une saturation du pool métier transforme une sonde en
requête bloquée, sans imposer un timeout artificiel aux opérations métier. Son
coût maximal est une connexion PostgreSQL supplémentaire par backend.

## Exposition Prometheus

Chaque backend expose `/metrics` uniquement sur `trust-circle-staging-edge`.
La gateway Nginx ne possède aucune route vers cet endpoint et renvoie `404`
sur `/metrics`, `/metrics/auth` et `/metrics/messaging`. NPM ne peut donc pas le
publier sous `trust-circle.kavalek.fr`.

Le LXC106 collecte localement les deux endpoints toutes les 30 secondes avec
`trust-circle-metrics-collector.timer`. Il remplace atomiquement :

- `/var/lib/prometheus/node-exporter/circlehaven-auth.prom` ;
- `/var/lib/prometheus/node-exporter/circlehaven-messaging.prom`.

Le `node_exporter` existant les restitue sur le port `9100`, déjà limité par
OPNsense à VM112 `10.0.50.10`. Aucun port ni aucune règle inter-VLAN
supplémentaire n'est nécessaire. Si une collecte privée échoue, l'ancien
contenu est supprimé et la série suivante vaut `0` :

```promql
circlehaven_metrics_collection_success{service="auth"}
circlehaven_metrics_collection_success{service="messaging"}
```

## Familles de métriques

Les métriques applicatives utilisent uniquement des labels issus de listes
fermées ou des modèles de routes Fastify :

- `circlehaven_http_requests_total` et
  `circlehaven_http_request_duration_seconds` ;
- `circlehaven_readiness_checks_total` ;
- `circlehaven_postgres_pool_connections` avec `total`, `idle` et `waiting` ;
- `circlehaven_socket_connection_attempts_total` ;
- `circlehaven_socket_transport_errors_total` ;
- `circlehaven_socket_events_total` et
  `circlehaven_socket_event_duration_seconds` ;
- `circlehaven_socket_broadcasts_total` ;
- `circlehaven_socket_active_connections` ;
- `circlehaven_socket_rooms` et `circlehaven_socket_room_members` par type
  `user`, `group` ou `conversation`.

`prom-client` 15.1.3, sous licence Apache-2.0, fournit en complément les
métriques runtime Node avec les préfixes `circlehaven_auth_` et
`circlehaven_messaging_` : CPU, mémoire, event loop, garbage collector,
handles et temps de démarrage. Cette version est épinglée car elle supporte
Node 20 ; la bibliothèque renommée `@prometheus-io/client` exige Node 22 ou
plus et sera réévaluée avec la montée de version runtime.

Il est interdit d'ajouter comme label une URL brute, query string, IP, compte,
appareil, socket, groupe, conversation, message, room, clé, token, payload,
ciphertext ou valeur fournie par un client. Un nouveau nom d'événement
Socket.IO doit être ajouté à la liste fermée ; toute valeur inconnue devient
`other`.

## Coût et bruit

L'instrumentation HTTP et Socket.IO ne réalise aucun accès réseau ou SQL. Les
histogrammes et compteurs sont mis à jour en mémoire, et les gauges lisent des
compteurs locaux des pools/adapters au moment du scrape. Le parcours des rooms
est donc payé au maximum une fois par scrape, jamais sur le chemin d'envoi
d'un message.

`/live`, `/ready`, `/health` et `/metrics` sont exclus des métriques HTTP et
des logs de cycle de vie afin de ne pas créer de boucle d'auto-observation ou
du bruit toutes les 30 secondes. Le résultat de readiness possède son propre
compteur agrégé.

## Installation du collecteur staging

Après déploiement de la release, installer les trois fichiers versionnés :

```bash
install -o root -g root -m 0755 \
  deploy/staging/host/trust-circle-metrics-collector \
  /usr/local/sbin/trust-circle-metrics-collector
install -o root -g root -m 0644 \
  deploy/staging/host/trust-circle-metrics-collector.service \
  deploy/staging/host/trust-circle-metrics-collector.timer \
  /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now trust-circle-metrics-collector.timer
systemctl start trust-circle-metrics-collector.service
```

Contrôler ensuite sans afficher de configuration privée :

```bash
systemctl is-active trust-circle-metrics-collector.timer
systemctl show trust-circle-metrics-collector.service \
  -p Result -p ExecMainStatus
curl -fsS http://127.0.0.1:9100/metrics | \
  grep -E '^(circlehaven_metrics_collection_success|circlehaven_readiness_checks_total)'
```

Le service est `oneshot`, sans capability, avec système de fichiers protégé ;
seul le répertoire textfile est inscriptible. Il n'accède ni aux secrets, ni
au socket Docker, ni à PostgreSQL.

## Diagnostic et rollback

Si `circlehaven_metrics_collection_success` vaut `0`, vérifier dans l'ordre le
conteneur, `/ready`, l'IP Docker fixe puis le timer. Une valeur `up=1` pour le
job `docker-node` prouve seulement que `node_exporter` répond ; elle ne prouve
pas que les backends sont prêts.

Le rollback du collecteur est sans effet sur l'application :

```bash
systemctl disable --now trust-circle-metrics-collector.timer
rm /etc/systemd/system/trust-circle-metrics-collector.service \
  /etc/systemd/system/trust-circle-metrics-collector.timer \
  /usr/local/sbin/trust-circle-metrics-collector
rm /var/lib/prometheus/node-exporter/circlehaven-auth.prom \
  /var/lib/prometheus/node-exporter/circlehaven-messaging.prom
systemctl daemon-reload
```

La suppression des cinq fichiers ci-dessus ne supprime aucune donnée métier et
ne modifie ni Prometheus, ni `node_exporter`, ni les règles réseau existantes.
