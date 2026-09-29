import type { FastifyInstance, FastifyRequest } from 'fastify';
import {
  collectDefaultMetrics,
  Counter,
  Gauge,
  Histogram,
  Registry,
} from 'prom-client';
import type { Server as IOServer } from 'socket.io';

const SERVICE = 'messaging';
const SILENT_ROUTES = new Set(['/health', '/live', '/ready', '/metrics']);
const HTTP_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD']);
const SOCKET_EVENTS = new Set([
  'conv:subscribe',
  'conv:subscribe:batch',
  'conv:unsubscribe',
  'typing:start',
  'typing:stop',
]);
const SOCKET_BROADCAST_EVENTS = new Set([
  'presence:conversation:batch',
  'presence:conversation',
  'presence:update',
  'typing:start',
  'typing:stop',
  'typing:error',
  'conversation:created',
  'conv:read',
  'device:revoked',
  'device:key-directory-changed',
  'group:member_joined',
  'group:joined',
  'message:new',
]);
const ROOM_TYPES = ['user', 'group', 'conversation'] as const;

type SocketOutcome = 'handled' | 'failure';

function routeTemplate(request: FastifyRequest): string {
  const route = request.routeOptions?.url;
  return typeof route === 'string' && route.startsWith('/') ? route : 'unmatched';
}

function methodLabel(method: string): string {
  return HTTP_METHODS.has(method) ? method : 'OTHER';
}

function statusClass(statusCode: number): string {
  if (statusCode >= 200 && statusCode < 600) return `${Math.floor(statusCode / 100)}xx`;
  return 'other';
}

function socketEventLabel(event: string): string {
  return SOCKET_EVENTS.has(event) ? event : 'other';
}

function broadcastEventLabel(event: string): string {
  return SOCKET_BROADCAST_EVENTS.has(event) ? event : 'other';
}

function roomType(room: string): (typeof ROOM_TYPES)[number] | undefined {
  if (room.startsWith('user:')) return 'user';
  if (room.startsWith('group:')) return 'group';
  if (room.startsWith('conv:')) return 'conversation';
  return undefined;
}

export interface MessagingMetrics {
  readonly registry: Registry;
  recordReadiness(outcome: 'ready' | 'not_ready'): void;
  recordSocketConnection(outcome: 'accepted' | 'refused'): void;
  recordSocketTransportError(): void;
  recordSocketBroadcast(event: string): void;
  observeSocketEvent(event: string, outcome: SocketOutcome, durationSeconds: number): void;
}

export function createMessagingMetrics(
  app: FastifyInstance,
  getIo: () => IOServer | undefined,
): MessagingMetrics {
  const registry = new Registry();
  collectDefaultMetrics({
    register: registry,
    prefix: 'circlehaven_messaging_',
  });

  const requests = new Counter({
    name: 'circlehaven_http_requests_total',
    help: 'Completed HTTP requests by service, method, route template and status class.',
    labelNames: ['service', 'method', 'route', 'status_class'] as const,
    registers: [registry],
  });
  const requestDuration = new Histogram({
    name: 'circlehaven_http_request_duration_seconds',
    help: 'HTTP request duration by service, method and route template.',
    labelNames: ['service', 'method', 'route'] as const,
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
    registers: [registry],
  });
  const readiness = new Counter({
    name: 'circlehaven_readiness_checks_total',
    help: 'Readiness checks by service and bounded outcome.',
    labelNames: ['service', 'outcome'] as const,
    registers: [registry],
  });
  const socketConnections = new Counter({
    name: 'circlehaven_socket_connection_attempts_total',
    help: 'Socket.IO connection attempts by bounded outcome.',
    labelNames: ['service', 'outcome'] as const,
    registers: [registry],
  });
  const socketTransportErrors = new Counter({
    name: 'circlehaven_socket_transport_errors_total',
    help: 'Socket.IO transport or handshake errors.',
    labelNames: ['service'] as const,
    registers: [registry],
  });
  const socketEvents = new Counter({
    name: 'circlehaven_socket_events_total',
    help: 'Handled Socket.IO events by fixed event name and outcome.',
    labelNames: ['service', 'event', 'outcome'] as const,
    registers: [registry],
  });
  const socketBroadcasts = new Counter({
    name: 'circlehaven_socket_broadcasts_total',
    help: 'Socket.IO broadcast calls by fixed event name.',
    labelNames: ['service', 'event'] as const,
    registers: [registry],
  });
  const socketEventDuration = new Histogram({
    name: 'circlehaven_socket_event_duration_seconds',
    help: 'Socket.IO event handling duration by fixed event name.',
    labelNames: ['service', 'event'] as const,
    buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5],
    registers: [registry],
  });

  new Gauge({
    name: 'circlehaven_postgres_pool_connections',
    help: 'PostgreSQL pool state by service.',
    labelNames: ['service', 'state'] as const,
    registers: [registry],
    collect() {
      const stats = app.db.poolStats();
      this.set({ service: SERVICE, state: 'total' }, stats.total);
      this.set({ service: SERVICE, state: 'idle' }, stats.idle);
      this.set({ service: SERVICE, state: 'waiting' }, stats.waiting);
    },
  });
  new Gauge({
    name: 'circlehaven_socket_active_connections',
    help: 'Current authenticated Socket.IO connections.',
    labelNames: ['service'] as const,
    registers: [registry],
    collect() {
      this.set({ service: SERVICE }, getIo()?.sockets.sockets.size ?? 0);
    },
  });
  new Gauge({
    name: 'circlehaven_socket_rooms',
    help: 'Application Socket.IO rooms by bounded room type.',
    labelNames: ['service', 'room_type'] as const,
    registers: [registry],
    collect() {
      const counts = new Map(ROOM_TYPES.map((type) => [type, 0]));
      const io = getIo();
      if (io !== undefined) {
        for (const room of io.sockets.adapter.rooms.keys()) {
          const type = roomType(room);
          if (type !== undefined) counts.set(type, (counts.get(type) ?? 0) + 1);
        }
      }
      for (const type of ROOM_TYPES) {
        this.set({ service: SERVICE, room_type: type }, counts.get(type) ?? 0);
      }
    },
  });
  new Gauge({
    name: 'circlehaven_socket_room_members',
    help: 'Aggregate and maximum Socket.IO room membership by bounded room type.',
    labelNames: ['service', 'room_type', 'stat'] as const,
    registers: [registry],
    collect() {
      const totals = new Map(ROOM_TYPES.map((type) => [type, { sum: 0, max: 0 }]));
      const io = getIo();
      if (io !== undefined) {
        for (const [room, members] of io.sockets.adapter.rooms.entries()) {
          const type = roomType(room);
          if (type === undefined) continue;
          const value = totals.get(type)!;
          value.sum += members.size;
          value.max = Math.max(value.max, members.size);
        }
      }
      for (const type of ROOM_TYPES) {
        const value = totals.get(type)!;
        this.set({ service: SERVICE, room_type: type, stat: 'sum' }, value.sum);
        this.set({ service: SERVICE, room_type: type, stat: 'max' }, value.max);
      }
    },
  });

  app.addHook('onResponse', (request, reply, done) => {
    const route = routeTemplate(request);
    if (!SILENT_ROUTES.has(route)) {
      const method = methodLabel(request.method);
      requests.inc({
        service: SERVICE,
        method,
        route,
        status_class: statusClass(reply.statusCode),
      });
      requestDuration.observe(
        { service: SERVICE, method, route },
        reply.elapsedTime / 1_000,
      );
    }
    done();
  });

  app.get('/metrics', async (_request, reply) => {
    reply.header('Cache-Control', 'no-store');
    reply.type(registry.contentType);
    return reply.send(await registry.metrics());
  });

  return {
    registry,
    recordReadiness(outcome) {
      readiness.inc({ service: SERVICE, outcome });
    },
    recordSocketConnection(outcome) {
      socketConnections.inc({ service: SERVICE, outcome });
    },
    recordSocketTransportError() {
      socketTransportErrors.inc({ service: SERVICE });
    },
    recordSocketBroadcast(event) {
      socketBroadcasts.inc({ service: SERVICE, event: broadcastEventLabel(event) });
    },
    observeSocketEvent(event, outcome, durationSeconds) {
      const safeEvent = socketEventLabel(event);
      socketEvents.inc({ service: SERVICE, event: safeEvent, outcome });
      socketEventDuration.observe({ service: SERVICE, event: safeEvent }, durationSeconds);
    },
  };
}
