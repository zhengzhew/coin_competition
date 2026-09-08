import { createUuid, type Mode, type TelemetryEvent } from '@coin-path/shared';

export interface TelemetryContext {
  playerUuid: string;
  assignmentKey: () => string | null;
  levelId: () => string | null;
  mode: () => Mode | null;
  attemptId: () => string | null;
}

const STORAGE_KEY = 'coin_competition_pending_events_v1';

export class TelemetryClient {
  private readonly pageInstanceId = createUuid();
  private readonly startedAt = performance.now();
  private streamId: string | null = null;
  private seq = 0;
  private queue: TelemetryEvent[] = [];
  private timer: number | null = null;
  private detachHandlers: Array<() => void> = [];

  constructor(private readonly context: TelemetryContext) {
    this.queue = this.restore();
    this.seq = this.queue.reduce((max, event) => Math.max(max, event.seq), 0);
  }

  async start() {
    const response = await fetch('/api/event-streams', {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scope: 'student_page' }),
    });
    if (!response.ok) throw new Error('event stream unavailable');
    this.streamId = (await response.json()).stream_id;
    this.captureDomInteractions();
    this.track('page_view', 'app.page', { path: location.pathname, viewport: [innerWidth, innerHeight] });
    this.timer = window.setInterval(() => void this.flush(), 1500);
    const onPageHide = () => void this.flush(true);
    window.addEventListener('pagehide', onPageHide);
    this.detachHandlers.push(() => window.removeEventListener('pagehide', onPageHide));
    await this.flush();
  }

  track(eventType: string, elementId: string | null, payload: Record<string, unknown> = {}) {
    const mono = performance.now();
    this.queue.push({
      schema_version: '2.0.0', event_id: createUuid(), player_uuid: this.context.playerUuid,
      session_id: null, assignment_key: this.context.assignmentKey(), level_id: this.context.levelId(),
      mode: this.context.mode(), attempt_id: this.context.attemptId(), stream_id: this.streamId || 'pending',
      seq: ++this.seq, event_type: eventType, element_id: elementId, interaction_id: createUuid(),
      client_time: new Date().toISOString(), page_instance_id: this.pageInstanceId,
      mono_ms: Math.round(mono * 10) / 10, elapsed_ms: Math.round((mono - this.startedAt) * 10) / 10,
      payload,
    });
    this.persist();
    if (this.queue.length >= 40) void this.flush();
  }

  async flush(keepalive = false) {
    if (!this.streamId || !this.queue.length) return;
    const batch = this.queue.slice(0, 200).map((event) => ({ ...event, stream_id: this.streamId! }));
    try {
      const response = await fetch(`/api/event-streams/${this.streamId}/batches`, {
        method: 'POST', credentials: 'include', keepalive,
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ events: batch }),
      });
      if (!response.ok) return;
      const ids = new Set(batch.map((event) => event.event_id));
      this.queue = this.queue.filter((event) => !ids.has(event.event_id));
      this.persist();
    } catch { this.persist(); }
  }

  stop() {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.detachHandlers.forEach((detach) => detach());
    void this.flush(true);
  }

  private captureDomInteractions() {
    for (const type of ['click', 'pointerdown', 'input', 'change', 'focusin', 'focusout'] as const) {
      const handler = (event: Event) => {
        const target = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-track-id]') : null;
        if (!target) return;
        const payload: Record<string, unknown> = { tag: target.tagName.toLowerCase() };
        if (event.target instanceof HTMLInputElement) payload.value = event.target.value;
        this.track(`ui_${type}`, target.dataset.trackId || null, payload);
      };
      document.addEventListener(type, handler, true);
      this.detachHandlers.push(() => document.removeEventListener(type, handler, true));
    }
  }

  private restore(): TelemetryEvent[] {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; }
  }

  private persist() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this.queue.slice(-2000))); } catch { /* unavailable */ }
  }
}
