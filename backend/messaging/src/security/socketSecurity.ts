import type { IncomingMessage } from 'node:http';

import type { Server, Socket } from 'socket.io';

export const MAX_SOCKETS_PER_USER_DEVICE = 5;
export const MAX_CONVERSATION_ROOMS_PER_SOCKET = 1_000;

const SUBSCRIBE_WINDOW_MS = 10_000;
const SUBSCRIBE_MAX_TOKENS = 60;
const TYPING_WINDOW_MS = 5_000;
const TYPING_MAX_EVENTS = 12;

export function isAllowedSocketOrigin(
  origin: string | undefined,
  allowedOrigins: readonly string[],
): boolean {
  // Flutter native clients do not set Origin. Browser clients must match exactly.
  return origin === undefined || allowedOrigins.includes(origin);
}

export function socketAllowRequest(allowedOrigins: readonly string[]) {
  return (request: IncomingMessage, callback: (message: string | null, success: boolean) => void): void => {
    callback(null, isAllowedSocketOrigin(request.headers.origin, allowedOrigins));
  };
}

class FixedWindowQuota {
  private startedAt = 0;
  private count = 0;

  constructor(private readonly maxEvents: number, private readonly windowMs: number) {}

  consume(now = Date.now(), units = 1): boolean {
    if (now - this.startedAt >= this.windowMs) {
      this.startedAt = now;
      this.count = 0;
    }
    if (!Number.isInteger(units) || units < 1 || this.count + units > this.maxEvents) return false;
    this.count += units;
    return true;
  }
}

export class SocketEventQuotas {
  private readonly subscriptions = new FixedWindowQuota(SUBSCRIBE_MAX_TOKENS, SUBSCRIBE_WINDOW_MS);
  private readonly typing = new FixedWindowQuota(TYPING_MAX_EVENTS, TYPING_WINDOW_MS);

  allowSubscription(itemCount = 1, now?: number): boolean {
    // A batch costs one token per 20 requested rooms. The legitimate maximum
    // (10 batches of 100 rooms) fits in one window, while SQL work stays bounded.
    return this.subscriptions.consume(now, Math.ceil(itemCount / 20));
  }

  allowTyping(now?: number): boolean {
    return this.typing.consume(now);
  }
}

interface SocketEmitter {
  emit(event: string, response: Record<string, unknown>): unknown;
}

export function createAckResponder(
  socket: SocketEmitter,
  event: string,
  ack?: (response: Record<string, unknown>) => void,
): (response: Record<string, unknown>) => void {
  let answered = false;
  return (response) => {
    if (answered) return;
    answered = true;
    ack?.(response);
    socket.emit(event, response);
  };
}

export function hasUserDeviceSocketCapacity(io: Server, userId: string, deviceId: string): boolean {
  let count = 0;
  for (const candidate of io.sockets.sockets.values()) {
    const auth = (candidate as Socket & { auth?: { userId?: string; deviceId?: string } }).auth;
    if (auth?.userId === userId && auth.deviceId === deviceId) count += 1;
  }
  return count < MAX_SOCKETS_PER_USER_DEVICE;
}

export class SocketConnectionLimiter {
  private readonly pending = new Map<string, number>();

  reserve(io: Server, userId: string, deviceId: string): boolean {
    const key = `${userId}:${deviceId}`;
    let active = 0;
    for (const candidate of io.sockets.sockets.values()) {
      const auth = (candidate as Socket & { auth?: { userId?: string; deviceId?: string } }).auth;
      if (auth?.userId === userId && auth.deviceId === deviceId) active += 1;
    }
    const pending = this.pending.get(key) ?? 0;
    if (active + pending >= MAX_SOCKETS_PER_USER_DEVICE) return false;
    this.pending.set(key, pending + 1);
    return true;
  }

  release(userId: string, deviceId: string): void {
    const key = `${userId}:${deviceId}`;
    const pending = this.pending.get(key) ?? 0;
    if (pending <= 1) this.pending.delete(key);
    else this.pending.set(key, pending - 1);
  }
}
