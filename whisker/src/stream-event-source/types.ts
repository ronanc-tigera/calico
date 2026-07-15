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

/**
 * The lifecycle of a stream, modelled as an explicit state machine.
 *
 *   idle ──start──▶ connecting ──open──▶ streaming ⇄ paused
 *                      ▲                     │
 *      transient error │                     ├──stop─────▶ stopped
 *      (auto-reconnect)└─────────────────────┤
 *                                            ├──done─────▶ complete  (server sentinel)
 *                                            └──fatal────▶ error
 *
 * `reset()` returns to `idle` from any state. `start()` is only honoured from
 * a non-active state (idle / stopped / complete / error).
 *
 * EventSource notes: the browser transparently reconnects after a dropped
 * connection, which surfaces here as a return to `connecting` and then
 * `streaming` on reopen. Server-Sent Events have no native end-of-stream, so
 * `complete` is only reached when the server emits the event named by
 * `completeEventName` (see {@link StreamOptions}); otherwise a stream ends via
 * `stop()`, `reset()`, or a fatal `error`.
 */
export type StreamStatus =
    | 'idle'
    | 'connecting'
    | 'streaming'
    | 'paused'
    | 'stopped'
    | 'complete'
    | 'error';

/**
 * An immutable snapshot of the stream. The controller only ever replaces
 * this object wholesale (never mutates it in place), so a reference check is
 * enough to know whether anything changed — which is exactly what
 * `useSyncExternalStore` relies on to skip renders.
 */
export interface StreamState<T> {
    readonly status: StreamStatus;
    /** Every record received so far, in arrival order (see `maxItems`). */
    readonly data: readonly T[];
    /** The fatal error that moved the stream to `error`, else `null`. */
    readonly error: Error | null;
}

export interface StreamOptions<T> {
    /** The SSE endpoint to stream from, e.g. `/server-stream`. */
    url: string;

    /**
     * Sent as the EventSource `withCredentials` flag, i.e. whether
     * cross-origin requests carry cookies/auth. EventSource cannot set custom
     * headers, a method, or a body — this is the only transport knob it offers.
     */
    withCredentials?: boolean;

    /**
     * The SSE event type to consume. Defaults to `'message'` (unnamed `data:`
     * frames). Set this to listen for a specific `event:` name instead.
     */
    eventName?: string;

    /**
     * The SSE event type that signals a clean end-of-stream. When the server
     * emits an event of this name the stream moves to `complete` and the
     * connection is closed. Omit if the stream never ends on its own.
     */
    completeEventName?: string;

    /**
     * Turns one event's `data` payload into a `T`. Called once per received
     * event. Defaults to `JSON.parse`. Override it to consume plain text, a
     * custom envelope, etc.
     */
    parse?: (data: string) => T;

    /**
     * When `true`, a `parse` failure is fatal and moves the stream to
     * `error`. When `false` (the default) a bad event is skipped and surfaced
     * via `onParseError`, keeping the stream alive — the resilient choice for
     * long-lived feeds.
     */
    strict?: boolean;

    /**
     * Incoming records are coalesced and published to subscribers at most
     * once per this many milliseconds, so a fast stream doesn't trigger a
     * React render per record. Defaults to 16ms (~one animation frame).
     * Set to 0 to publish on the next macrotask. Status changes always
     * publish immediately, regardless of this setting.
     */
    batchMs?: number;

    /**
     * Cap on retained records. Once exceeded, the oldest are dropped so
     * `data` never grows beyond `maxItems`. Also bounds the buffer held while
     * paused. Omit for unbounded retention.
     */
    maxItems?: number;

    /** Called for every record, synchronously, before it is batched. */
    onData?: (item: T) => void;
    /** Called on every status transition. */
    onStatusChange?: (status: StreamStatus, previous: StreamStatus) => void;
    /** Called once when a fatal error moves the stream to `error`. */
    onError?: (error: Error) => void;
    /** Called for each event whose `data` failed to `parse` in non-strict mode. */
    onParseError?: (data: string, error: unknown) => void;
    /** Called once when the server signals a clean end-of-stream. */
    onComplete?: () => void;
}
