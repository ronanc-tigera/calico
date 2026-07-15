// Copyright (c) 2026 Tigera, Inc. All rights reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import type { StreamOptions, StreamState, StreamStatus } from './types';

/** States in which a stream is running and can be paused/stopped. */
const ACTIVE_STATUSES: ReadonlySet<StreamStatus> = new Set<StreamStatus>([
    'connecting',
    'streaming',
    'paused',
]);

// EventSource.readyState values (per the WHATWG spec). Declared locally so the
// controller doesn't depend on the global constants being present at runtime
// (e.g. under jsdom, where EventSource is absent entirely).
const ES_OPEN = 1;
const ES_CLOSED = 2;

function toError(err: unknown): Error {
    return err instanceof Error ? err : new Error(String(err));
}

/**
 * Framework-agnostic engine for consuming a Server-Sent Events stream.
 *
 * It owns the transport (`EventSource`), a per-event parser, and a small state
 * machine (see {@link StreamStatus}). It is also an external store:
 * {@link subscribe} + {@link getSnapshot} plug straight into React's
 * `useSyncExternalStore` (see `useServerStream`), but the controller has no
 * React dependency and can be driven from anywhere.
 *
 * Design notes:
 *  - **Pause is a client-side buffer, not backpressure.** EventSource has no
 *    flow control, so pausing keeps the connection open and simply withholds
 *    events (buffering them) until {@link resume}. No records are lost, but —
 *    unlike a `fetch` reader — the server is not throttled while paused.
 *  - **Reconnects are transparent.** The browser auto-reconnects after a
 *    dropped connection; that surfaces as `connecting` and then `streaming`
 *    again, without losing the caller's `paused` intent.
 *  - **Snapshots are immutable and shared.** A new snapshot object is created
 *    only when something actually changes, so subscribers (React) can cheaply
 *    detect "nothing changed" by reference.
 *  - **Restart-safe.** Every event handler is fenced to the EventSource
 *    instance that registered it, so a stray event from a superseded
 *    connection after stop/reset/restart is ignored.
 */
export class StreamController<T = unknown> {
    private readonly options: StreamOptions<T>;
    private readonly parse: (data: string) => T;
    private readonly batchMs: number;

    private status: StreamStatus = 'idle';
    private data: T[] = [];
    private error: Error | null = null;

    /** The current immutable snapshot handed to subscribers. */
    private snapshot: StreamState<T>;
    private readonly subscribers = new Set<() => void>();

    // --- Transport state ---
    private eventSource: EventSource | null = null;
    // Records received while paused, held back until resume(). EventSource has
    // no backpressure, so "pause" is a client-side buffer, not a throttle.
    private pausedBuffer: T[] = [];

    // --- Batching state ---
    private pending: T[] = [];
    private flushHandle: ReturnType<typeof setTimeout> | null = null;

    constructor(options: StreamOptions<T>) {
        this.options = options;
        this.parse = options.parse ?? ((data) => JSON.parse(data) as T);
        this.batchMs = options.batchMs ?? 16;
        this.snapshot = { status: 'idle', data: this.data, error: null };
    }

    // ------------------------------------------------------------------
    // External store interface (consumed by useSyncExternalStore).
    // These are arrow fields so their references are stable across renders
    // and they can be destructured off the instance.
    // ------------------------------------------------------------------

    subscribe = (listener: () => void): (() => void) => {
        this.subscribers.add(listener);
        return () => {
            this.subscribers.delete(listener);
        };
    };

    getSnapshot = (): StreamState<T> => this.snapshot;

    /** Alias of {@link getSnapshot} for non-React callers. */
    getState = (): StreamState<T> => this.snapshot;

    // ------------------------------------------------------------------
    // Controls
    // ------------------------------------------------------------------

    /**
     * Open the connection and begin streaming. Ignored while already active
     * (connecting/streaming/paused). Starting always begins a fresh run:
     * previously collected data is cleared. Use {@link resume} to continue a
     * paused stream.
     */
    start = (): void => {
        if (ACTIVE_STATUSES.has(this.status)) return;

        this.teardownSource();
        this.resetInternals();
        this.data = [];
        this.error = null;
        this.setStatus('connecting');

        let es: EventSource;
        try {
            es = new EventSource(this.options.url, {
                withCredentials: this.options.withCredentials,
            });
        } catch (err) {
            this.fail(toError(err));
            return;
        }
        this.eventSource = es;

        const dataEvent = this.options.eventName ?? 'message';

        es.addEventListener('open', () => {
            if (this.eventSource !== es) return;
            // A (re)connection is live. Preserve an explicit pause across it.
            if (this.status !== 'paused') this.setStatus('streaming');
        });

        es.addEventListener(dataEvent, (event) => {
            if (this.eventSource !== es) return;
            this.handleData((event as MessageEvent<string>).data);
        });

        if (this.options.completeEventName) {
            es.addEventListener(this.options.completeEventName, () => {
                if (this.eventSource !== es) return;
                this.handleComplete();
            });
        }

        es.addEventListener('error', () => {
            if (this.eventSource !== es) return;
            this.handleTransportError(es);
        });
    };

    /**
     * Pause consumption. The connection stays open; events that arrive while
     * paused are buffered and delivered on {@link resume}. No-op unless
     * currently `streaming`.
     */
    pause = (): void => {
        if (this.status !== 'streaming') return;
        this.setStatus('paused');
    };

    /**
     * Resume a paused stream: deliver everything buffered during the pause (in
     * order), then reflect the live connection state. No-op unless currently
     * `paused`.
     */
    resume = (): void => {
        if (this.status !== 'paused') return;

        this.drainPausedBuffer();

        // The browser may have been auto-reconnecting underneath us while
        // paused; reflect where the connection actually is.
        const es = this.eventSource;
        if (!es || es.readyState === ES_CLOSED) {
            this.fail(new Error(`Connection to ${this.options.url} closed while paused`));
            return;
        }
        this.setStatus(es.readyState === ES_OPEN ? 'streaming' : 'connecting');
    };

    /**
     * Stop the stream and close the connection. Collected data is retained
     * (call {@link reset} to clear it); any records withheld during a pause are
     * discarded. No-op unless currently active.
     */
    stop = (): void => {
        if (!ACTIVE_STATUSES.has(this.status)) return;
        this.teardownSource();
        this.pausedBuffer = [];
        this.setStatus('stopped');
    };

    /**
     * Close any active connection, discard all collected data and buffers, and
     * return to `idle`. Valid from any state.
     */
    reset = (): void => {
        this.teardownSource();
        this.resetInternals();
        this.data = [];
        this.error = null;
        this.setStatus('idle');
    };

    /**
     * Permanently tear down the controller: close the connection and drop all
     * subscribers. Intended for a React unmount. The instance should not be
     * reused afterwards.
     */
    dispose = (): void => {
        this.teardownSource();
        this.subscribers.clear();
    };

    /** Force any batched records to be published immediately. */
    flush = (): void => {
        this.flushNow();
    };

    // ------------------------------------------------------------------
    // Event handling
    // ------------------------------------------------------------------

    private handleData(data: string): void {
        let item: T;
        try {
            item = this.parse(data);
        } catch (err) {
            if (this.options.strict) {
                this.fail(new Error(`Failed to parse stream event: ${toError(err).message}`));
            } else {
                this.options.onParseError?.(data, err);
            }
            return;
        }
        // While paused, withhold the record (delivered on resume) rather than
        // publishing it — EventSource keeps the socket flowing regardless.
        if (this.status === 'paused') {
            this.bufferWhilePaused(item);
            return;
        }
        this.enqueue(item);
    }

    private bufferWhilePaused(item: T): void {
        this.pausedBuffer.push(item);
        const max = this.options.maxItems;
        if (max != null && this.pausedBuffer.length > max) {
            this.pausedBuffer = this.pausedBuffer.slice(this.pausedBuffer.length - max);
        }
    }

    private drainPausedBuffer(): void {
        if (this.pausedBuffer.length === 0) return;
        const buffered = this.pausedBuffer;
        this.pausedBuffer = [];
        for (const item of buffered) this.enqueue(item);
    }

    private handleComplete(): void {
        // A clean end-of-stream should never silently drop records, so deliver
        // anything buffered during a pause before finishing.
        this.drainPausedBuffer();
        this.teardownSource();
        this.setStatus('complete');
        this.options.onComplete?.();
    }

    private handleTransportError(es: EventSource): void {
        // EventSource fires 'error' both for transient drops (it will
        // auto-reconnect: readyState !== CLOSED) and for fatal failures it
        // won't retry (readyState === CLOSED).
        if (es.readyState !== ES_CLOSED) {
            // Transient — the browser is reconnecting. Surface it as
            // `connecting`, unless the caller has explicitly paused.
            if (this.status !== 'paused') this.setStatus('connecting');
            return;
        }
        this.fail(new Error(`Stream connection to ${this.options.url} failed`));
    }

    private fail(error: Error): void {
        this.teardownSource();
        this.error = error;
        this.setStatus('error');
        this.options.onError?.(error);
    }

    // ------------------------------------------------------------------
    // Batching + publishing
    // ------------------------------------------------------------------

    private enqueue(item: T): void {
        this.pending.push(item);
        this.options.onData?.(item);
        this.scheduleFlush();
    }

    private scheduleFlush(): void {
        if (this.flushHandle !== null) return;
        this.flushHandle = setTimeout(() => {
            this.flushHandle = null;
            this.flushNow();
        }, this.batchMs);
    }

    private flushNow(): void {
        this.clearFlush();
        if (this.foldPending()) this.publish();
    }

    /** Merge batched records into `data` (respecting `maxItems`). */
    private foldPending(): boolean {
        if (this.pending.length === 0) return false;
        let next = this.data.concat(this.pending);
        this.pending = [];
        const max = this.options.maxItems;
        if (max != null && next.length > max) {
            next = next.slice(next.length - max);
        }
        this.data = next;
        return true;
    }

    private setStatus(next: StreamStatus): void {
        const previous = this.status;
        this.status = next;
        // Fold any batched records into this transition so a consumer never
        // observes, say, `complete` with records still pending.
        this.clearFlush();
        this.foldPending();
        this.publish();
        if (previous !== next) this.options.onStatusChange?.(next, previous);
    }

    /** Rebuild and broadcast the snapshot, but only if something changed. */
    private publish(): void {
        const s = this.snapshot;
        if (s.status === this.status && s.data === this.data && s.error === this.error) {
            return;
        }
        this.snapshot = { status: this.status, data: this.data, error: this.error };
        for (const listener of this.subscribers) listener();
    }

    // ------------------------------------------------------------------
    // Teardown helpers
    // ------------------------------------------------------------------

    /** Close the live connection. Fences any of its handlers still to fire. */
    private teardownSource(): void {
        if (this.eventSource) {
            this.eventSource.close();
            this.eventSource = null;
        }
    }

    /** Reset transport/batching buffers without touching published state. */
    private resetInternals(): void {
        this.clearFlush();
        this.pausedBuffer = [];
        this.pending = [];
    }

    private clearFlush(): void {
        if (this.flushHandle !== null) {
            clearTimeout(this.flushHandle);
            this.flushHandle = null;
        }
    }
}
