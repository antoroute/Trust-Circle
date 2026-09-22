# Politique de journalisation sûre

Statut : contrat implémenté par `TC-206`
Dernière mise à jour : 2026-09-22

Cette politique couvre Auth, Messaging, Socket.IO, la présence et la gateway
Nginx. Elle complète les invariants 5 et 18. Un journal technique n'est ni un
journal d'audit métier ni un journal de transparence cryptographique.

## Principes

1. Le contenu autorisé est défini par liste blanche ; la redaction Pino est une
   seconde défense et non l'autorisation de sérialiser un objet entier.
2. Une requête nominale produit au maximum une ligne applicative de fin. Les
   healthchecks et événements fréquents de frappe ou présence ne produisent pas
   de ligne de succès.
3. Une erreur inconnue est réduite à une catégorie et un code contrôlé. Les
   codes bruts sont mappés vers une petite liste fermée (`database_unavailable`,
   `database_constraint`, `database_retryable`, `dependency_unavailable`). Son
   message, sa pile, sa cause et les propriétés d'une erreur PostgreSQL ne sont
   jamais envoyés au logger de staging/production.
4. Les logs ne provoquent aucune requête réseau ou SQL supplémentaire et leur
   échec ne modifie jamais une décision d'authentification ou d'autorisation.

## Schéma autorisé

Chaque ligne Auth/Messaging porte `schemaVersion`, `service`, `environment`,
`event` et le niveau/timestamp Pino. Selon l'événement, seuls les champs
suivants sont admis :

| Domaine | Champs autorisés |
|---|---|
| HTTP | `requestId`, `method`, `route`, `statusCode`, `durationMs`, `outcome` |
| Socket.IO | `connectionId`, `socketEvent`, `outcome`, `count` |
| domaine | `event`, `outcome`, compteurs agrégés non identifiants |
| erreur | `errorType`, `errorCode`, `configurationField` allowlisté |

`outcome` vaut uniquement `success`, `client_error`, `server_error` ou
`failure` pour un événement non HTTP.

La gateway suit le même préfixe et utilise `durationSeconds`, seule unité
disponible nativement dans sa configuration Nginx. Elle n'enregistre pas la
route, car une route inconnue ne possède pas de modèle paramétré sûr.

## Données interdites

Ne jamais journaliser, même au niveau `debug` :

- URL ou query string brute, Host, IP, port client, user-agent ou referrer ;
- header, cookie, corps HTTP, payload ou ACK Socket.IO ;
- e-mail, nom, identifiant de compte/appareil/socket/cercle/conversation/message
  ou liste de destinataires ;
- mot de passe, access/refresh token, grant, nonce ou preuve d'appareil ;
- clé publique ou privée, signature, wrapped key, ciphertext, plaintext ou
  enveloppe E2EE ;
- objet d'erreur, message, pile, cause, requête SQL ou paramètres SQL.

Un hachage d'une donnée interdite reste une donnée corrélable et n'est pas une
anonymisation. Il est donc interdit par défaut.

## Corrélation

Nginx génère `$request_id` à la frontière, remplace tout `X-Request-ID` fourni
par le client, le transmet au backend et renvoie cette même valeur dans la
réponse. Auth et Messaging n'acceptent que le format `32` caractères
hexadécimaux minuscules ; une valeur absente ou invalide est remplacée par un
identifiant CSPRNG local. Les backends ne sont pas publiés directement dans la
topologie staging.

Une connexion Socket.IO reçoit un `connectionId` CSPRNG distinct du `socket.id`
et des identifiants métier. Son logger conserve aussi le `requestId` strict du
handshake pour relier gateway et connexion. `connectionId` sert uniquement à
relier les événements techniques de cette connexion et n'est pas renvoyé comme
identité au client.

Un identifiant de corrélation aide au diagnostic mais n'est jamais une preuve
d'identité, d'autorisation, d'intégrité ou d'origine.

## Erreurs et réponses client

- Une erreur `5xx` inattendue renvoie un corps générique et le `X-Request-ID`.
- Une absence attendue et une panne PostgreSQL restent deux cas distincts ; la
  panne ne doit pas être maquillée en mauvais identifiant.
- Un rejet asynchrone Socket.IO est capturé. L'ACK ou l'événement d'erreur est
  générique, émis au plus une fois et ne contient pas le détail interne.
- Une erreur de configuration de démarrage produit une seule ligne JSON
  minimale et un code de sortie non nul, sans valeur de configuration.

## Défenses techniques et performance

Les serializers HTTP sont restrictifs, les chemins Pino sensibles sont
supprimés explicitement et les logs automatiques Fastify sont désactivés. Cette
combinaison évite de dépendre uniquement d'une liste de noms secrets et retire
les deux lignes automatiques début/fin ainsi que les milliers de healthchecks.

Le niveau par défaut est `info` et `LOG_LEVEL` est validé par allowlist. Le
niveau `debug` exige une configuration explicite, mais ne lève aucune
interdiction de données. Les succès très fréquents restent silencieux. Les
métriques agrégées et budgets de latence seront ajoutés par `TC-207`/`TC-806`.

PostgreSQL staging n'enregistre ni statements ni paramètres et limite son log
serveur aux événements fatals en format `terse`. Cela évite aussi les `DETAIL`
de contraintes susceptibles de recopier une valeur métier. Les migrations
peuvent journaliser leurs noms de changements, jamais les valeurs de secrets ou
données métier.

Nginx ne sait pas assainir ou structurer son `error_log`, qui peut recopier IP
et URI. Il est désactivé : les statuts d'échec restent dans l'access log JSON
sûr et les backends conservent leurs événements assainis. `TC-207` doit fournir
les compteurs et alertes agrégés avant d'autoriser une filière d'erreur plus
riche.

## Transport, accès et rétention

Les conteneurs écrivent vers `journald`; le homelab peut les transférer vers
Loki. La rétention effective, le chiffrement, les ACL de consultation et la
suppression centralisée ne sont pas encore prouvés : `TC-208` doit les établir
avant toute donnée réelle. Jusqu'alors, seul le staging synthétique est admis.

Toute extraction pour support doit être bornée dans le temps, filtrée aux
services concernés et relue avant partage. Aucun journal brut n'entre dans un
ticket, prompt, dépôt Git ou rapport public.

## Contrôles obligatoires

- tests de sentinelles sur texte brut avant chaque évolution du logger ;
- garde statique interdisant `console.*` dans les sources runtime ;
- inspection post-déploiement : JSON valide, corrélation identique,
  healthchecks silencieux et aucune sentinelle synthétique ;
- revue de tout nouveau champ de log au regard de cette liste blanche ;
- vérification périodique des règles de rétention et d'accès avec `TC-208`.
