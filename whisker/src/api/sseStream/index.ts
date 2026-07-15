/**
 * SseStream is a framework-agnostic owner of one server-sent-event stream:
 * connection lifecycle, batching, capping, dedupe, and reconnection all live
 * here, behind a subscribe/getSnapshot interface (compatible with React's
 * useSyncExternalStore). Everything domain-specific is injected — the
 * connection recipe as a `StreamConnect` closure (which captures the query
 * and receives the resume bookmark), item semantics as a `StreamPolicy` —
 * so this module must never import flow-log types.
 */

export type StreamStatus =
    | 'connecting' // source created, not yet open
    | 'waiting' // open, nothing received on this connection yet
    | 'streaming' // receiving items
    | 'reconnecting' // dropped; retrying with backoff
    | 'paused' // stopped by the user; resumable
    | 'error'; // gave up after retries; resumable

export type StreamError = {
    failureCount: number;
    message: string;
};

/**
 * The connection state pair: an error object exists exactly when the status
 * is 'error', so the illegal combinations are unrepresentable.
 */
export type StreamState =
    | { status: Exclude<StreamStatus, 'error'>; error: null }
    | { status: 'error'; error: StreamError };

export type StreamSnapshot<T> = {
    /** Newest-first, capped at maxItems. A new array on every flush. */
    items: T[];
    /** Monotonic count of accepted (parsed, non-duplicate) items. */
    totalReceived: number;
    /** Items trimmed from the tail by the maxItems cap. */
    droppedCount: number;
} & StreamState;

/**
 * Opens a transport for one connection attempt. The closure captures the
 * query; bookmark is the largest policy.bookmark() seen since the stream
 * started (null before any item arrives) and is set on reconnect/resume so
 * the stream picks up where it left off.
 */
export type StreamConnect = (bookmark: number | null) => EventSource;

export type StreamPolicy<T> = {
    /** Resume position of an item, e.g. its end time in millis. */
    bookmark: (item: T) => number;
    /**
     * Identity for reconnect-overlap dedupe. Two items with the same key
     * are the same item; the second is discarded.
     */
    dedupeKey?: (item: T) => string;
    /** Newest-first ordering. When set, flushed batches are merge-sorted in. */
    compare?: (a: T, b: T) => number;
};

export type RetryOptions = {
    maxAttempts: number;
    baseDelayMs: number;
    maxDelayMs: number;
};

export type SseStreamOptions<T> = {
    /** Parse one event payload; return null to drop it. Throwing drops it too. */
    parse: (raw: string) => T | null;
    policy: StreamPolicy<T>;
    throttleMs?: number;
    maxItems?: number;
    retry?: RetryOptions;
};

const DEFAULT_THROTTLE_MS = 1000;
const DEFAULT_MAX_ITEMS = 20000;
const DEFAULT_RETRY: RetryOptions = {
    maxAttempts: 5,
    baseDelayMs: 1000,
    maxDelayMs: 30000,
};

export class SseStream<T> {
    private readonly parse: (raw: string) => T | null;
    private readonly policy: StreamPolicy<T>;
    private readonly throttleMs: number;
    private readonly maxItems: number;
    private readonly retry: RetryOptions;

    private connect: StreamConnect | null = null;
    private source: EventSource | null = null;
    private bookmark: number | null = null;
    private buffer: T[] = [];
    private seenKeys = new Set<string>();
    private flushTimer: ReturnType<typeof setTimeout> | null = null;
    private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    private failureCount = 0;
    private subscribers = new Set<() => void>();
    private snapshot: StreamSnapshot<T> = {
        status: 'paused',
        items: [],
        totalReceived: 0,
        droppedCount: 0,
        error: null,
    };

    constructor(options: SseStreamOptions<T>) {
        this.parse = options.parse;
        this.policy = options.policy;
        this.throttleMs = options.throttleMs ?? DEFAULT_THROTTLE_MS;
        this.maxItems = options.maxItems ?? DEFAULT_MAX_ITEMS;
        this.retry = options.retry ?? DEFAULT_RETRY;
    }

    /**
     * Start streaming with a new connection recipe, replacing any current
     * stream and its accumulated data.
     */
    start = (connect: StreamConnect) => {
        this.connect = connect;
        this.bookmark = null;
        this.buffer = [];
        this.seenKeys.clear();
        this.failureCount = 0;
        this.setData({ items: [], totalReceived: 0, droppedCount: 0 });
        this.open();
    };

    /**
     * Stop streaming. The pending buffer is discarded, not flushed —
     * pausing must never mutate items (consumers key row-state resets on
     * changes). The bookmark only advances at flush time, so discarded
     * items are re-sent when the stream resumes.
     */
    pause = () => {
        this.clearTimers();
        this.buffer = [];
        this.closeSource();
        this.setState({ status: 'paused', error: null });
    };

    /** Reconnect from the current bookmark, keeping accumulated items. */
    resume = () => {
        if (this.connect === null) {
            return;
        }
        this.failureCount = 0;
        this.open();
    };

    subscribe = (callback: () => void) => {
        this.subscribers.add(callback);
        return () => {
            this.subscribers.delete(callback);
        };
    };

    getSnapshot = (): StreamSnapshot<T> => this.snapshot;

    /**
     * Close the transport and stop all timers. Subscribers unsubscribe
     * themselves, and a later start/resume revives the stream — this
     * keeps React StrictMode's dev-only unmount/remount cycle working.
     */
    destroy() {
        this.closeSource();
        this.clearTimers();
        this.setState({ status: 'paused', error: null });
    }

    private open() {
        if (this.connect === null) {
            return;
        }
        this.closeSource();
        this.clearTimers();
        this.setState({ status: 'connecting', error: null });

        const source = this.connect(this.bookmark);
        this.source = source;

        source.onopen = () => {
            if (source !== this.source) {
                return;
            }
            this.failureCount = 0;
            this.setState({ status: 'waiting', error: null });
        };

        source.onmessage = (event) => {
            if (source !== this.source) {
                return;
            }
            this.receive(event.data);
        };

        source.onerror = () => {
            if (source !== this.source) {
                return;
            }
            this.handleError();
        };
    }

    private receive(raw: string) {
        let item: T | null;
        try {
            item = this.parse(raw);
        } catch (parseError) {
            console.error('Skipping malformed stream event', parseError);
            return;
        }

        if (this.snapshot.status !== 'streaming') {
            this.setState({ status: 'streaming', error: null });
        }

        if (item === null) {
            return;
        }

        this.buffer.push(item);

        if (this.flushTimer === null) {
            this.flushTimer = setTimeout(() => {
                this.flushTimer = null;
                this.flush();
            }, this.throttleMs);
        }
    }

    private flush() {
        if (this.flushTimer !== null) {
            clearTimeout(this.flushTimer);
            this.flushTimer = null;
        }
        if (this.buffer.length === 0) {
            return;
        }

        const pending = this.buffer;
        this.buffer = [];

        const next = accumulateBatch(
            pending,
            {
                items: this.snapshot.items,
                bookmark: this.bookmark,
                totalReceived: this.snapshot.totalReceived,
                droppedCount: this.snapshot.droppedCount,
            },
            this.seenKeys,
            this.policy,
            this.maxItems,
        );

        if (next === null) {
            return;
        }

        this.bookmark = next.bookmark;
        this.setData({
            items: next.items,
            totalReceived: next.totalReceived,
            droppedCount: next.droppedCount,
        });
    }

    private handleError() {
        this.flush();
        this.closeSource();
        this.failureCount += 1;

        if (this.failureCount > this.retry.maxAttempts) {
            this.setState({
                status: 'error',
                error: {
                    failureCount: this.failureCount,
                    message: 'The flow stream disconnected repeatedly',
                },
            });
            return;
        }

        this.setState({ status: 'reconnecting', error: null });
        const delay = Math.min(
            this.retry.maxDelayMs,
            this.retry.baseDelayMs * 2 ** (this.failureCount - 1),
        );
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            this.open();
        }, delay);
    }

    // The two snapshot writers: setState's signature is what enforces the
    // status/error pairing, so the casts below are safe — a spread of the
    // union just loses the discriminant for the compiler.

    private setState(state: StreamState) {
        this.publish({ ...this.snapshot, ...state } as StreamSnapshot<T>);
    }

    private setData(
        data: Pick<
            StreamSnapshot<T>,
            'items' | 'totalReceived' | 'droppedCount'
        >,
    ) {
        this.publish({ ...this.snapshot, ...data } as StreamSnapshot<T>);
    }

    private publish(snapshot: StreamSnapshot<T>) {
        this.snapshot = snapshot;
        this.subscribers.forEach((callback) => callback());
    }

    private closeSource() {
        if (this.source) {
            this.source.close();
            this.source = null;
        }
    }

    private clearTimers() {
        if (this.flushTimer !== null) {
            clearTimeout(this.flushTimer);
            this.flushTimer = null;
        }
        if (this.reconnectTimer !== null) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
    }
}

export type AccumulatedItems<T> = {
    items: T[];
    bookmark: number | null;
    totalReceived: number;
    droppedCount: number;
};

/**
 * The item-accumulation step, kept out of the class so the trickiest logic
 * is testable without timers or transports: dedupe the pending batch,
 * advance the bookmark over accepted items, merge newest-first, trim to
 * maxItems. Returns null when nothing new was accepted. `seenKeys` is owned
 * by the caller and mutated here: accepted keys are added, trimmed items'
 * keys removed. Dedupe and the bookmark advance only for items that reach a
 * flush — anything discarded beforehand (pause) is re-sent and accepted
 * when the stream resumes from the bookmark.
 */
export const accumulateBatch = <T>(
    pending: readonly T[],
    current: AccumulatedItems<T>,
    seenKeys: Set<string>,
    policy: StreamPolicy<T>,
    maxItems: number,
): AccumulatedItems<T> | null => {
    let bookmark = current.bookmark;

    const batch: T[] = [];
    pending.forEach((item) => {
        if (policy.dedupeKey) {
            const key = policy.dedupeKey(item);
            if (seenKeys.has(key)) {
                return;
            }
            seenKeys.add(key);
        }
        bookmark = Math.max(bookmark ?? -Infinity, policy.bookmark(item));
        batch.push(item);
    });

    if (batch.length === 0) {
        return null;
    }

    let items: T[];
    if (policy.compare) {
        batch.sort(policy.compare);
        items = mergeSorted(batch, current.items, policy.compare);
    } else {
        // Newest-first: later-received items go in front.
        items = [...batch.reverse(), ...current.items];
    }

    let droppedCount = current.droppedCount;
    if (items.length > maxItems) {
        const trimmed = items.slice(maxItems);
        droppedCount += trimmed.length;
        const dedupeKey = policy.dedupeKey;
        if (dedupeKey) {
            trimmed.forEach((item) => seenKeys.delete(dedupeKey(item)));
        }
        items = items.slice(0, maxItems);
    }

    return {
        items,
        bookmark,
        totalReceived: current.totalReceived + batch.length,
        droppedCount,
    };
};

const mergeSorted = <T>(
    a: T[],
    b: T[],
    compare: (x: T, y: T) => number,
): T[] => {
    const merged: T[] = new Array(a.length + b.length);
    let i = 0;
    let j = 0;
    let k = 0;
    while (i < a.length && j < b.length) {
        merged[k++] = compare(a[i], b[j]) <= 0 ? a[i++] : b[j++];
    }
    while (i < a.length) {
        merged[k++] = a[i++];
    }
    while (j < b.length) {
        merged[k++] = b[j++];
    }
    return merged;
};
