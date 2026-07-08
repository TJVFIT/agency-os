'use client';

/**
 * Live worker liveness indicator (SPEC §14): the worker writes an
 * `activity_log` row with action `worker.heartbeat` every 5 min. We subscribe
 * to `activity.insert`, remember the last heartbeat time, and flip to a
 * "dead" state once 6+ minutes pass without one. A local ticker re-evaluates
 * so the indicator degrades even when no events arrive.
 */

import { useEffect, useState } from 'react';

import { useRealtimeEvent } from '@/components/realtime-provider';
import { tr } from '@/lib/i18n/tr';
import type { ActivityEntry } from '@/lib/db/types';

const DEAD_AFTER_MS = 6 * 60 * 1000;

/** Turkish relative time, e.g. "az önce", "3 dk önce", "2 sa önce". */
function relativeTr(from: number): string {
  const secs = Math.max(0, Math.floor((Date.now() - from) / 1000));
  if (secs < 10) return 'az önce';
  if (secs < 60) return `${secs} sn önce`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins} dk önce`;
  const hours = Math.floor(mins / 60);
  return `${hours} sa önce`;
}

export function WorkerStatus({
  initialHeartbeat = null,
}: {
  initialHeartbeat?: string | null;
}) {
  const [lastBeat, setLastBeat] = useState<number | null>(
    initialHeartbeat ? new Date(initialHeartbeat).getTime() : null,
  );
  // A ticking clock so "alive → dead" happens without new events.
  const [now, setNow] = useState<number>(() => Date.now());

  useRealtimeEvent('activity.insert', (entry: ActivityEntry) => {
    if (entry.action === 'worker.heartbeat') {
      setLastBeat(new Date(entry.created_at).getTime());
      setNow(Date.now());
    }
  });

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30 * 1000);
    return () => clearInterval(id);
  }, []);

  const alive = lastBeat !== null && now - lastBeat < DEAD_AFTER_MS;

  return (
    <div className="flex items-center gap-2 text-xs">
      <span
        className={`h-2 w-2 shrink-0 rounded-full ${
          alive ? 'bg-emerald-500' : 'bg-red-500'
        }`}
        aria-hidden
      />
      {alive ? (
        <span className="text-neutral-300">
          {tr.dashboard.workerAlive}
          {lastBeat !== null && (
            <span className="ml-1 text-neutral-500">
              · {relativeTr(lastBeat)}
            </span>
          )}
        </span>
      ) : (
        <span className="text-red-400">{tr.dashboard.workerDead}</span>
      )}
    </div>
  );
}
