import {
    accumulateBatch,
    SseStream,
    SseStreamOptions,
    StreamConnect,
    StreamPolicy,
} from '..';

type Item = { id: string; time: number };

class FakeEventSource {
    url: string;
    closed = false;
    onopen: (() => void) | null = null;
    onmessage: ((event: { data: string }) => void) | null = null;
    onerror: (() => void) | null = null;

    constructor(url: string) {
        this.url = url;
    }

    close() {
        this.closed = true;
    }

    open() {
        this.onopen?.();
    }

    emit(item: unknown) {
        this.onmessage?.({ data: JSON.stringify(item) });
    }

    emitRaw(data: string) {
        this.onmessage?.({ data });
    }

    fail() {
        this.onerror?.();
    }
}

const item = (id: string, time: number): Item => ({ id, time });

const policy: StreamPolicy<Item> = {
    bookmark: (i) => i.time,
    dedupeKey: (i) => i.id,
    compare: (a, b) => b.time - a.time,
};

describe('SseStream', () => {
    let sources: FakeEventSource[];

    const connectTo =
        (filter: string): StreamConnect =>
        (bookmark) => {
            const source = new FakeEventSource(
                `stream?filter=${filter}&from=${bookmark ?? 'start'}`,
            );
            sources.push(source);
            return source as unknown as EventSource;
        };

    const createStream = (overrides: Partial<SseStreamOptions<Item>> = {}) =>
        new SseStream<Item>({
            parse: (raw) => JSON.parse(raw),
            policy,
            throttleMs: 1000,
            maxItems: 5,
            retry: { maxAttempts: 2, baseDelayMs: 1000, maxDelayMs: 30000 },
            ...overrides,
        });

    // Counts item-array replacements (i.e. flushes) from this point on.
    const trackFlushes = (stream: SseStream<Item>) => {
        let count = 0;
        let last = stream.getSnapshot().items;
        stream.subscribe(() => {
            const { items } = stream.getSnapshot();
            if (items !== last) {
                count += 1;
                last = items;
            }
        });
        return () => count;
    };

    beforeEach(() => {
        jest.useFakeTimers();
        sources = [];
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    it('moves through connecting, waiting and streaming', () => {
        const stream = createStream();

        expect(stream.getSnapshot().status).toEqual('paused');

        stream.start(connectTo('a'));
        expect(stream.getSnapshot().status).toEqual('connecting');
        expect(sources[0].url).toEqual('stream?filter=a&from=start');

        sources[0].open();
        expect(stream.getSnapshot().status).toEqual('waiting');

        sources[0].emit(item('1', 10));
        expect(stream.getSnapshot().status).toEqual('streaming');
        expect(stream.getSnapshot().items).toEqual([]);

        jest.advanceTimersByTime(1000);
        expect(stream.getSnapshot().items).toEqual([item('1', 10)]);
    });

    it('batches a throttle window into a single flush', () => {
        const stream = createStream();
        stream.start(connectTo('a'));
        sources[0].open();
        const flushes = trackFlushes(stream);

        sources[0].emit(item('1', 10));
        sources[0].emit(item('2', 30));
        sources[0].emit(item('3', 20));

        jest.advanceTimersByTime(1000);

        const snapshot = stream.getSnapshot();
        expect(snapshot.items).toEqual([
            item('2', 30),
            item('3', 20),
            item('1', 10),
        ]);
        expect(snapshot.totalReceived).toEqual(3);
        expect(flushes()).toEqual(1);
    });

    it('merges later batches keeping newest-first order', () => {
        const stream = createStream();
        stream.start(connectTo('a'));
        sources[0].open();

        sources[0].emit(item('1', 10));
        sources[0].emit(item('3', 30));
        jest.advanceTimersByTime(1000);

        sources[0].emit(item('2', 20));
        jest.advanceTimersByTime(1000);

        expect(stream.getSnapshot().items).toEqual([
            item('3', 30),
            item('2', 20),
            item('1', 10),
        ]);
    });

    it('caps items and counts what was dropped', () => {
        const stream = createStream();
        stream.start(connectTo('a'));
        sources[0].open();

        [1, 2, 3, 4, 5].forEach((n) => sources[0].emit(item(`${n}`, n)));
        jest.advanceTimersByTime(1000);

        sources[0].emit(item('6', 6));
        sources[0].emit(item('7', 7));
        jest.advanceTimersByTime(1000);

        const snapshot = stream.getSnapshot();
        expect(snapshot.items.map((i) => i.time)).toEqual([7, 6, 5, 4, 3]);
        expect(snapshot.droppedCount).toEqual(2);
        expect(snapshot.totalReceived).toEqual(7);
    });

    it('drops duplicate items', () => {
        const stream = createStream();
        stream.start(connectTo('a'));
        sources[0].open();

        sources[0].emit(item('1', 10));
        sources[0].emit(item('1', 10));
        jest.advanceTimersByTime(1000);

        expect(stream.getSnapshot().items).toEqual([item('1', 10)]);
        expect(stream.getSnapshot().totalReceived).toEqual(1);
    });

    it('skips malformed events and keeps streaming', () => {
        const consoleSpy = jest
            .spyOn(console, 'error')
            .mockImplementation(() => {});
        const stream = createStream();
        stream.start(connectTo('a'));
        sources[0].open();

        expect(() => sources[0].emitRaw('not json')).not.toThrow();

        sources[0].emit(item('1', 10));
        jest.advanceTimersByTime(1000);

        expect(stream.getSnapshot().items).toEqual([item('1', 10)]);
        expect(consoleSpy).toHaveBeenCalled();
        consoleSpy.mockRestore();
    });

    it('drops items the parser returns null for', () => {
        const stream = createStream({
            parse: (raw: string) => {
                const parsed = JSON.parse(raw);
                return parsed.id === 'drop' ? null : parsed;
            },
        });
        stream.start(connectTo('a'));
        sources[0].open();

        sources[0].emit(item('drop', 10));
        sources[0].emit(item('1', 20));
        jest.advanceTimersByTime(1000);

        expect(stream.getSnapshot().items).toEqual([item('1', 20)]);
        expect(stream.getSnapshot().totalReceived).toEqual(1);
    });

    it('reconnects with backoff from the bookmark after an error', () => {
        const stream = createStream();
        stream.start(connectTo('a'));
        sources[0].open();
        sources[0].emit(item('1', 50));
        jest.advanceTimersByTime(1000);

        sources[0].fail();
        expect(stream.getSnapshot().status).toEqual('reconnecting');
        expect(sources[0].closed).toEqual(true);
        expect(sources).toHaveLength(1);

        jest.advanceTimersByTime(1000);
        expect(sources).toHaveLength(2);
        expect(sources[1].url).toEqual('stream?filter=a&from=50');

        sources[1].open();
        expect(stream.getSnapshot().status).toEqual('waiting');
        expect(stream.getSnapshot().error).toBeNull();
    });

    it('does not duplicate items re-sent across a reconnect', () => {
        const stream = createStream();
        stream.start(connectTo('a'));
        sources[0].open();
        sources[0].emit(item('1', 50));
        jest.advanceTimersByTime(1000);

        sources[0].fail();
        jest.advanceTimersByTime(1000);
        sources[1].open();
        sources[1].emit(item('1', 50));
        sources[1].emit(item('2', 60));
        jest.advanceTimersByTime(1000);

        expect(stream.getSnapshot().items).toEqual([
            item('2', 60),
            item('1', 50),
        ]);
        expect(stream.getSnapshot().totalReceived).toEqual(2);
    });

    it('gives up after repeated failures and recovers on resume', () => {
        const stream = createStream();
        stream.start(connectTo('a'));
        sources[0].open();
        sources[0].emit(item('1', 50));
        jest.advanceTimersByTime(1000);

        sources[0].fail();
        jest.advanceTimersByTime(1000);
        sources[1].fail();
        jest.advanceTimersByTime(2000);
        sources[2].fail();

        const snapshot = stream.getSnapshot();
        expect(snapshot.status).toEqual('error');
        expect(snapshot.error).toEqual({
            failureCount: 3,
            message: expect.any(String),
        });

        stream.resume();
        expect(stream.getSnapshot().status).toEqual('connecting');
        expect(stream.getSnapshot().error).toBeNull();
        expect(sources[3].url).toEqual('stream?filter=a&from=50');
    });

    it('pause discards the pending buffer without mutating items', () => {
        const stream = createStream();
        stream.start(connectTo('a'));
        sources[0].open();
        sources[0].emit(item('1', 50));
        jest.advanceTimersByTime(1000);

        sources[0].emit(item('2', 60));
        stream.pause();

        const snapshot = stream.getSnapshot();
        expect(snapshot.status).toEqual('paused');
        expect(snapshot.items).toEqual([item('1', 50)]);
        expect(sources[0].closed).toEqual(true);

        jest.advanceTimersByTime(60000);
        expect(stream.getSnapshot().items).toBe(snapshot.items);
        expect(sources).toHaveLength(1);
    });

    it('resume keeps items, reconnects from the bookmark and recovers discarded items', () => {
        const stream = createStream();
        stream.start(connectTo('a'));
        sources[0].open();
        sources[0].emit(item('1', 50));
        jest.advanceTimersByTime(1000);
        sources[0].emit(item('2', 60));
        stream.pause();

        stream.resume();

        // The bookmark excludes the discarded item, so the server re-sends
        // it and it is not treated as a duplicate.
        expect(sources[1].url).toEqual('stream?filter=a&from=50');
        expect(stream.getSnapshot().items).toEqual([item('1', 50)]);
        expect(stream.getSnapshot().status).toEqual('connecting');

        sources[1].open();
        sources[1].emit(item('2', 60));
        jest.advanceTimersByTime(1000);

        expect(stream.getSnapshot().items).toEqual([
            item('2', 60),
            item('1', 50),
        ]);
        expect(stream.getSnapshot().totalReceived).toEqual(2);
    });

    it('start replaces the stream and clears accumulated state', () => {
        const stream = createStream();
        stream.start(connectTo('a'));
        sources[0].open();
        sources[0].emit(item('1', 50));
        jest.advanceTimersByTime(1000);

        stream.start(connectTo('b'));

        expect(sources[0].closed).toEqual(true);
        expect(sources[1].url).toEqual('stream?filter=b&from=start');
        const snapshot = stream.getSnapshot();
        expect(snapshot.items).toEqual([]);
        expect(snapshot.totalReceived).toEqual(0);
        expect(snapshot.droppedCount).toEqual(0);
    });

    it('ignores events from a replaced source', () => {
        const stream = createStream();
        stream.start(connectTo('a'));
        const stale = sources[0];
        stream.start(connectTo('b'));

        stale.emit(item('1', 10));
        stale.fail();
        jest.advanceTimersByTime(1000);

        expect(stream.getSnapshot().items).toEqual([]);
        expect(stream.getSnapshot().status).toEqual('connecting');
    });

    it('notifies subscribers and keeps snapshot identity stable between changes', () => {
        const stream = createStream();
        const subscriber = jest.fn();
        stream.subscribe(subscriber);

        const before = stream.getSnapshot();
        expect(stream.getSnapshot()).toBe(before);

        stream.start(connectTo('a'));
        expect(subscriber).toHaveBeenCalled();
        expect(stream.getSnapshot()).not.toBe(before);

        const after = stream.getSnapshot();
        expect(stream.getSnapshot()).toBe(after);
    });

    it('destroy closes the source and can be revived by resume', () => {
        const stream = createStream();
        const subscriber = jest.fn();
        stream.subscribe(subscriber);
        stream.start(connectTo('a'));

        stream.destroy();

        expect(sources[0].closed).toEqual(true);
        expect(stream.getSnapshot().status).toEqual('paused');
        subscriber.mockClear();

        sources[0].emit(item('1', 10));
        jest.advanceTimersByTime(1000);
        expect(subscriber).not.toHaveBeenCalled();
        expect(stream.getSnapshot().items).toEqual([]);

        // StrictMode's dev unmount/remount destroys and then restarts.
        stream.resume();
        expect(stream.getSnapshot().status).toEqual('connecting');
        expect(sources).toHaveLength(2);
    });
});

describe('accumulateBatch', () => {
    const empty = {
        items: [] as Item[],
        bookmark: null,
        totalReceived: 0,
        droppedCount: 0,
    };

    it('dedupes, advances the bookmark and merges newest-first', () => {
        const seenKeys = new Set<string>();

        const first = accumulateBatch(
            [item('1', 10), item('3', 30), item('1', 10)],
            empty,
            seenKeys,
            policy,
            5,
        );

        expect(first).toEqual({
            items: [item('3', 30), item('1', 10)],
            bookmark: 30,
            totalReceived: 2,
            droppedCount: 0,
        });

        const second = accumulateBatch(
            [item('2', 20)],
            first!,
            seenKeys,
            policy,
            5,
        );

        expect(second!.items).toEqual([
            item('3', 30),
            item('2', 20),
            item('1', 10),
        ]);
        expect(second!.bookmark).toEqual(30);
    });

    it('returns null when every pending item is a duplicate', () => {
        const seenKeys = new Set(['1']);

        expect(
            accumulateBatch([item('1', 10)], empty, seenKeys, policy, 5),
        ).toBeNull();
    });

    it('trims to the cap and evicts trimmed keys so they can be re-accepted', () => {
        const seenKeys = new Set<string>();

        const first = accumulateBatch(
            [1, 2, 3].map((n) => item(`${n}`, n)),
            empty,
            seenKeys,
            policy,
            2,
        );

        expect(first!.items.map((i) => i.time)).toEqual([3, 2]);
        expect(first!.droppedCount).toEqual(1);
        expect(seenKeys.has('1')).toEqual(false);

        // The trimmed item is no longer a known duplicate.
        const second = accumulateBatch(
            [item('1', 1)],
            first!,
            seenKeys,
            policy,
            2,
        );

        expect(second).not.toBeNull();
    });
});
