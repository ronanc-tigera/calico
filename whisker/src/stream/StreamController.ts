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

function isAbortError(err: unknown): boolean {
    return err instanceof Error && err.name === 'AbortError';
}

function toError(err: unknown): Error {
    return err instanceof Error ? err : new Error(String(err));
}

/**
 * Framework-agnostic engine for consuming a server stream.
 *
 * It owns the transport (`fetch` + `ReadableStream` + `AbortController`), a
 * newline-delimited parser, and a small state machine (see {@link StreamStatus}).
 * It is also an external store: {@link subscribe} + {@link getSnapshot} plug
 * straight into React's `useSyncExternalStore` (see `useServerStream`), but the
 * controller has no React dependency and can be driven from anywhere.
 *
 * Design notes:
 *  - **Pause is real backpressure.** Pausing simply stops pulling from the
 *    reader; TCP flow control then pauses a well-behaved server. Nothing is
 *    buffered client-side beyond the one chunk that may already be in flight,
 *    and the connection stays open so resume is instant.
 *  - **Snapshots are immutable and shared.** A new snapshot object is created
 *    only when something actually changes, so subscribers (React) can cheaply
 *    detect "nothing changed" by reference.
 *  - **Restart-safe.** A monotonically increasing generation counter fences
 *    off any in-flight read loop from a previous run, so rapid
 *    stop/reset/start sequences can never cross their wires.
 */
export class StreamController<T = unknown> {
    private readonly options: StreamOptions<T>;
    private readonly parse: (line: string) => T;
    private readonly batchMs: number;

    private status: StreamStatus = 'idle';
    private data: T[] = [];
    private error: Error | null = null;

    /** The current immutable snapshot handed to subscribers. */
    private snapshot: StreamState<T>;
    private readonly subscribers = new Set<() => void>();

    // --- Transport / parsing state ---
    private abortController: AbortController | null = null;
    private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
    private decoder = new TextDecoder();
    private textBuffer = '';
    private pumping = false;
    /** Fences an in-flight pump loop against restarts; bumped by start/abort. */
    private generation = 0;

    // --- Batching state ---
    private pending: T[] = [];
    private flushHandle: ReturnType<typeof setTimeout> | null = null;

    constructor(options: StreamOptions<T>) {
        this.options = options;
        this.parse = options.parse ?? ((line) => JSON.parse(line) as T);
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
    start = async (): Promise<void> => {
        if (ACTIVE_STATUSES.has(this.status)) return;

        const gen = ++this.generation;
        this.resetInternals();
        this.data = [];
        this.error = null;
        this.setStatus('connecting');

        const abortController = new AbortController();
        this.abortController = abortController;

        try {
            const response = await fetch(this.options.url, {
                ...this.options.fetchOptions,
                signal: abortController.signal,
            });

            // stop()/reset()/a newer start() may have superseded us while the
            // request was in flight.
            if (this.generation !== gen || abortController.signal.aborted) {
                void response.body?.cancel().catch(() => {});
                return;
            }
            if (!response.ok) {
                throw new Error(`Request to ${this.options.url} failed: ${response.status}`);
            }
            if (!response.body) {
                throw new Error(`Response from ${this.options.url} has no readable body`);
            }

            this.reader = response.body.getReader();
            this.setStatus('streaming');
            void this.pump(gen);
        } catch (err) {
            if (this.generation !== gen || isAbortError(err)) return;
            this.fail(toError(err));
        }
    };

    /**
     * Pause consumption. The pump loop stops pulling at its next iteration and
     * the connection is held open, letting backpressure throttle the server.
     * No-op unless currently `streaming`.
     */
    pause = (): void => {
        if (this.status !== 'streaming') return;
        this.setStatus('paused');
    };

    /**
     * Resume a paused stream: flush anything decoded at the moment we paused,
     * then start pulling again. No-op unless currently `paused`.
     */
    resume = (): void => {
        if (this.status !== 'paused') return;
        this.setStatus('streaming');
        this.flushLines();
        void this.pump(this.generation);
    };

    /**
     * Stop the stream and close the connection. Collected data is retained
     * (call {@link reset} to clear it). No-op unless currently active.
     */
    stop = (): void => {
        if (!ACTIVE_STATUSES.has(this.status)) return;
        this.abort();
        this.setStatus('stopped');
    };

    /**
     * Abort any active stream, discard all collected data and buffers, and
     * return to `idle`. Valid from any state.
     */
    reset = (): void => {
        this.abort();
        this.resetInternals();
        this.data = [];
        this.error = null;
        this.setStatus('idle');
    };

    /**
     * Permanently tear down the controller: abort the stream and drop all
     * subscribers. Intended for a React unmount. The instance should not be
     * reused afterwards.
     */
    dispose = (): void => {
        this.abort();
        this.subscribers.clear();
    };

    /** Force any batched records to be published immediately. */
    flush = (): void => {
        this.flushNow();
    };

    // ------------------------------------------------------------------
    // Pump loop
    // ------------------------------------------------------------------

    private async pump(gen: number): Promise<void> {
        if (this.pumping || !this.reader || this.generation !== gen) return;
        this.pumping = true;
        const reader = this.reader;
        try {
            while (this.generation === gen && this.status === 'streaming') {
                const { done, value } = await reader.read();
                // A reset/restart during the await invalidates this loop.
                if (this.generation !== gen) return;
                if (done) {
                    this.finish();
                    return;
                }
                // Always decode so no bytes are lost across a pause boundary.
                this.textBuffer += this.decoder.decode(value, { stream: true });
                // If pause/stop landed while awaiting, hold the decoded text
                // and stop pulling; resume() will emit it.
                if (this.status === 'streaming') {
                    this.flushLines();
                }
            }
        } catch (err) {
            if (this.generation === gen && !isAbortError(err)) {
                this.fail(toError(err));
            }
        } finally {
            if (this.generation === gen) this.pumping = false;
        }
    }

    private finish(): void {
        // Flush the decoder and treat any trailing (unterminated) line as a
        // final complete record.
        this.textBuffer += this.decoder.decode();
        this.flushLines(true);
        this.reader = null;
        this.abortController = null;
        this.setStatus('complete');
        this.options.onComplete?.();
    }

    private fail(error: Error): void {
        this.reader = null;
        this.abortController = null;
        this.error = error;
        this.setStatus('error');
        this.options.onError?.(error);
    }

    // ------------------------------------------------------------------
    // Parsing (newline-delimited)
    // ------------------------------------------------------------------

    private flushLines(final = false): void {
        let lines: string[];
        if (final) {
            lines = this.textBuffer.split('\n');
            this.textBuffer = '';
        } else {
            lines = this.textBuffer.split('\n');
            // The final element is an as-yet incomplete line; keep it buffered.
            this.textBuffer = lines.pop() ?? '';
        }
        for (const raw of lines) {
            this.consumeLine(raw);
            // A strict parse failure moves us to `error`; stop consuming.
            if (this.status === 'error') break;
        }
    }

    private consumeLine(raw: string): void {
        const line = raw.trim();
        if (line === '') return;
        let item: T;
        try {
            item = this.parse(line);
        } catch (err) {
            if (this.options.strict) {
                this.fail(new Error(`Failed to parse stream record: ${toError(err).message}`));
            } else {
                this.options.onParseError?.(line, err);
            }
            return;
        }
        this.enqueue(item);
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

    /** Tear down the live connection and invalidate the running pump loop. */
    private abort(): void {
        this.generation++;
        this.clearFlush();
        if (this.abortController) {
            this.abortController.abort();
            this.abortController = null;
        }
        if (this.reader) {
            void this.reader.cancel().catch(() => {});
            this.reader = null;
        }
        this.pumping = false;
    }

    /** Reset parsing/transport buffers without touching published state. */
    private resetInternals(): void {
        this.clearFlush();
        this.reader = null;
        this.decoder = new TextDecoder();
        this.textBuffer = '';
        this.pending = [];
        this.pumping = false;
    }

    private clearFlush(): void {
        if (this.flushHandle !== null) {
            clearTimeout(this.flushHandle);
            this.flushHandle = null;
        }
    }
}
