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
 *   idle ──start──▶ connecting ──▶ streaming ⇄ paused
 *                                     │  │
 *                                     │  └──stop──▶ stopped
 *                                     ├──(eof)────▶ complete
 *                                     └──(error)──▶ error
 *
 * `reset()` returns to `idle` from any state. `start()` is only honoured
 * from a non-active state (idle / stopped / complete / error).
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
    /** The endpoint to stream from, e.g. `/server-stream`. */
    url: string;

    /**
     * Extra options forwarded to `fetch` (method, headers, body, credentials,
     * …). A `signal` is always supplied by the controller and will override
     * any signal set here.
     */
    fetchOptions?: RequestInit;

    /**
     * Turns one delimited record of the response into a `T`. Records are
     * split on newlines (the stream is treated as NDJSON), so this is called
     * once per non-empty line. Defaults to `JSON.parse`. Override it to
     * consume plain text, SSE `data:` frames, a custom framing, etc.
     */
    parse?: (line: string) => T;

    /**
     * When `true`, a `parse` failure is fatal and moves the stream to
     * `error`. When `false` (the default) a bad record is skipped and
     * surfaced via `onParseError`, keeping the stream alive — the resilient
     * choice for long-lived NDJSON feeds.
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
     * `data` never grows beyond `maxItems`. Omit for unbounded retention.
     */
    maxItems?: number;

    /** Called for every record, synchronously, before it is batched. */
    onData?: (item: T) => void;
    /** Called on every status transition. */
    onStatusChange?: (status: StreamStatus, previous: StreamStatus) => void;
    /** Called once when a fatal error moves the stream to `error`. */
    onError?: (error: Error) => void;
    /** Called for each record that failed to `parse` in non-strict mode. */
    onParseError?: (line: string, error: unknown) => void;
    /** Called once when the server closes the stream cleanly. */
    onComplete?: () => void;
}
