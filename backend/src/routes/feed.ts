/**
 * feed.ts
 *
 * SSE activity feed endpoint: GET /boards/:boardId/events
 *
 * Streams real-time board activity to connected clients using Server-Sent Events.
 * On connect:
 *   1. Flushes recent history from card_events (or replays missed events via Last-Event-ID)
 *   2. Subscribes to DomainEventBus and forwards new events as SSE frames
 *   3. Sends a heartbeat comment every FEED_SSE_HEARTBEAT_MS to keep the connection alive
 * On disconnect: cleans up the heartbeat interval and calls bus unsubscribe.
 */

import { Router } from 'express';
import type { Queryable } from '../db/queryable';
import type { DomainEventBus, DomainEvent } from '../events/domain-event-bus';
import { EventRepository } from '../repositories/event.repository';
import { asyncHandler } from '../lib/asyncHandler';
import type { Config } from '../config';

const DEFAULT_MAX_HISTORY   = 20;
const DEFAULT_HEARTBEAT_MS  = 15000;

export function createFeedRouter(
  db: Queryable,
  bus: DomainEventBus,
  config?: Config,
): Router {
  const router = Router({ mergeParams: true });
  const eventRepo = new EventRepository(db);

  router.get('/', asyncHandler(async (req, res) => {
    const boardId     = (req.params as Record<string, string>)['boardId'];
    const lastEventId = req.headers['last-event-id'] as string | undefined;
    const maxHistory  = config?.FEED_MAX_HISTORY  ?? DEFAULT_MAX_HISTORY;
    const heartbeatMs = config?.FEED_SSE_HEARTBEAT_MS ?? DEFAULT_HEARTBEAT_MS;

    // --- Subscribe first to buffer events that arrive during DB query ---
    const localBuffer: DomainEvent[] = [];
    let buffering = true;
    const unsubscribe = bus.subscribe(boardId, (event: DomainEvent) => {
      if (buffering) {
        localBuffer.push(event);
      } else {
        sendFrame(event.eventId, event);
      }
    });

    // --- SSE headers ---
    res.setHeader('Content-Type',      'text/event-stream');
    res.setHeader('Cache-Control',     'no-cache');
    res.setHeader('Connection',        'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    /**
     * Write a single SSE frame.
     * Format: "id: <eventId>\ndata: <json>\n\n"
     */
    function sendFrame(eventId: string, data: unknown): void {
      res.write(`id: ${eventId}\ndata: ${JSON.stringify(data)}\n\n`);
    }

    // --- History flush ---
    const replayedIds = new Set<string>();
    if (lastEventId) {
      const missed = await eventRepo.findAfterById(boardId, lastEventId);
      for (const row of missed) {
        replayedIds.add(row.id);
        sendFrame(row.id, row);
      }
    } else {
      const recent = await eventRepo.findRecentByBoard(boardId, maxHistory);
      const ordered = [...recent].reverse();
      for (const row of ordered) {
        replayedIds.add(row.id);
        sendFrame(row.id, row);
      }
    }

    // --- Drain buffer (skip events already sent via history) ---
    buffering = false;
    for (const event of localBuffer) {
      if (!replayedIds.has(event.eventId)) {
        sendFrame(event.eventId, event);
      }
    }
    localBuffer.length = 0;
    replayedIds.clear();

    // --- Heartbeat ---
    const heartbeat = setInterval(() => {
      res.write(': heartbeat\n\n');
    }, heartbeatMs);

    // --- Cleanup on disconnect ---
    req.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  }));

  return router;
}
