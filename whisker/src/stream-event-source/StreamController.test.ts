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

import { StreamController } from './StreamController';

// jsdom does not implement EventSource, so provide a controllable fake that
// lets each test drive open/message/error events by hand.
class FakeEventSource {
    static readonly CONNECTING = 0;
    static readonly OPEN = 1;
    static readonly CLOSED = 2;

    static instances: FakeEventSource[] = [];
    static last(): FakeEventSource {
        return FakeEventSource.instances[FakeEventSource.instances.length - 1];
    }

    readonly url: string;
    readonly withCredentials: boolean;
    readyState: number = FakeEventSource.CONNECTING;
    private readonly listeners = new Map<string, Set<(e: unknown) => void>>();

    constructor(url: string, init?: { withCredentials?: boolean }) {
        this.url = url;
        this.withCredentials = init?.withCredentials ?? false;
        FakeEventSource.instances.push(this);
    }

    addEventListener(type: string, cb: (e: unknown) => void): void {
        let set = this.listeners.get(type);
        if (!set) {
            set = new Set();
            this.listeners.set(type, set);
        }
        set.add(cb);
    }

    removeEventListener(type: string, cb: (e: unknown) => void): void {
        this.listeners.get(type)?.delete(cb);
    }

    close(): void {
        this.readyState = FakeEventSource.CLOSED;
    }

    private dispatch(type: string, event: unknown): void {
        this.listeners.get(type)?.forEach((cb) => cb(event));
    }

    // --- test drivers ---
    emitOpen(): void {
        this.readyState = FakeEventSource.OPEN;
        this.dispatch('open', {});
    }
    emitMessage(data: string, type = 'message'): void {
        this.dispatch(type, { data, type });
    }
    /** Transient failure — the browser would auto-reconnect. */
    emitTransientError(): void {
        this.readyState = FakeEventSource.CONNECTING;
        this.dispatch('error', {});
    }
    /** Fatal failure — the browser gives up. */
    emitFatalError(): void {
        this.readyState = FakeEventSource.CLOSED;
        this.dispatch('error', {});
    }
}

/** Wait real time for the batch timer (setTimeout) to fire. */
function wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

beforeEach(() => {
    FakeEventSource.instances = [];
    (globalThis as unknown as { EventSource: unknown }).EventSource = FakeEventSource;
});

afterEach(() => {
    delete (globalThis as unknown as { EventSource?: unknown }).EventSource;
    jest.restoreAllMocks();
});

describe('StreamController (EventSource)', () => {
    it('starts idle', () => {
        const c = new StreamController({ url: '/server-stream' });
        expect(c.getState()).toEqual({ status: 'idle', data: [], error: null });
    });

    it('connects, then streams events once the connection opens', () => {
        const c = new StreamController<{ n: number }>({ url: '/server-stream', batchMs: 0 });

        c.start();
        expect(c.getState().status).toBe('connecting');

        const es = FakeEventSource.last();
        expect(es.url).toBe('/server-stream');

        es.emitOpen();
        expect(c.getState().status).toBe('streaming');

        es.emitMessage('{"n":1}');
        es.emitMessage('{"n":2}');
        c.flush();

        // No end-of-stream sentinel, so it stays streaming.
        expect(c.getState().status).toBe('streaming');
        expect(c.getState().data).toEqual([{ n: 1 }, { n: 2 }]);
    });

    it('completes when the server emits the sentinel event, then closes', () => {
        const c = new StreamController<number>({
            url: '/server-stream',
            batchMs: 0,
            completeEventName: 'done',
        });

        c.start();
        const es = FakeEventSource.last();
        es.emitOpen();
        es.emitMessage('1');
        es.emitMessage('2');
        es.emitMessage('', 'done');
        c.flush();

        expect(c.getState().status).toBe('complete');
        expect(c.getState().data).toEqual([1, 2]);
        expect(es.readyState).toBe(FakeEventSource.CLOSED);
    });

    it('buffers events while paused and delivers them in order on resume', () => {
        const received: number[] = [];
        const c = new StreamController<number>({
            url: '/server-stream',
            batchMs: 0,
            onData: (x) => received.push(x),
        });

        c.start();
        const es = FakeEventSource.last();
        es.emitOpen();
        es.emitMessage('1');
        es.emitMessage('2');
        expect(received).toEqual([1, 2]);

        c.pause();
        expect(c.getState().status).toBe('paused');

        // Events that arrive while paused must not be delivered...
        es.emitMessage('3');
        es.emitMessage('4');
        expect(received).toEqual([1, 2]);

        // ...until resume flushes the buffer.
        c.resume();
        expect(c.getState().status).toBe('streaming');
        expect(received).toEqual([1, 2, 3, 4]);
    });

    it('keeps the connection open while paused (no close)', () => {
        const c = new StreamController<number>({ url: '/server-stream', batchMs: 0 });
        c.start();
        const es = FakeEventSource.last();
        es.emitOpen();
        c.pause();
        expect(es.readyState).toBe(FakeEventSource.OPEN);
    });

    it('stops, closes the connection, and retains collected data', () => {
        const c = new StreamController<number>({ url: '/server-stream', batchMs: 0 });

        c.start();
        const es = FakeEventSource.last();
        es.emitOpen();
        es.emitMessage('1');
        es.emitMessage('2');
        c.flush();

        c.stop();
        expect(c.getState().status).toBe('stopped');
        expect(c.getState().data).toEqual([1, 2]);
        expect(es.readyState).toBe(FakeEventSource.CLOSED);

        // Anything the (now closed) source emits after stop is ignored.
        es.emitMessage('3');
        c.flush();
        expect(c.getState().data).toEqual([1, 2]);
    });

    it('discards records withheld during a pause when stopped', () => {
        const c = new StreamController<number>({ url: '/server-stream', batchMs: 0 });

        c.start();
        const es = FakeEventSource.last();
        es.emitOpen();
        es.emitMessage('1');
        c.flush();

        c.pause();
        es.emitMessage('2'); // buffered, not delivered
        c.stop();
        c.resume(); // no-op: not paused anymore
        c.flush();

        expect(c.getState().status).toBe('stopped');
        expect(c.getState().data).toEqual([1]); // "2" dropped
    });

    it('resets to idle and clears data', () => {
        const c = new StreamController<number>({ url: '/server-stream', batchMs: 0 });

        c.start();
        const es = FakeEventSource.last();
        es.emitOpen();
        es.emitMessage('1');
        c.flush();
        expect(c.getState().data).toEqual([1]);

        c.reset();
        expect(c.getState()).toEqual({ status: 'idle', data: [], error: null });
        expect(es.readyState).toBe(FakeEventSource.CLOSED);
    });

    it('start() begins a fresh run (new connection, cleared data) after stop', () => {
        const c = new StreamController<number>({ url: '/server-stream', batchMs: 0 });

        c.start();
        FakeEventSource.last().emitOpen();
        FakeEventSource.last().emitMessage('1');
        c.flush();
        c.stop();

        c.start();
        expect(FakeEventSource.instances).toHaveLength(2);
        FakeEventSource.last().emitOpen();
        FakeEventSource.last().emitMessage('9');
        c.flush();

        expect(c.getState().data).toEqual([9]); // not [1, 9]
    });

    it('start() is a no-op while already active', () => {
        const c = new StreamController<number>({ url: '/server-stream', batchMs: 0 });
        c.start();
        c.start(); // ignored: already connecting/streaming
        expect(FakeEventSource.instances).toHaveLength(1);
    });

    it('auto-reconnect: a transient error returns to connecting, then streaming', () => {
        const transitions: string[] = [];
        const c = new StreamController<number>({
            url: '/server-stream',
            batchMs: 0,
            onStatusChange: (s) => transitions.push(s),
        });

        c.start();
        const es = FakeEventSource.last();
        es.emitOpen();
        es.emitTransientError();
        expect(c.getState().status).toBe('connecting');
        es.emitOpen(); // browser reconnected
        expect(c.getState().status).toBe('streaming');

        expect(transitions).toEqual(['connecting', 'streaming', 'connecting', 'streaming']);
    });

    it('a transient error while paused does not disturb the paused state', () => {
        const c = new StreamController<number>({ url: '/server-stream', batchMs: 0 });
        c.start();
        const es = FakeEventSource.last();
        es.emitOpen();
        c.pause();
        es.emitTransientError();
        expect(c.getState().status).toBe('paused');
    });

    it('moves to error on a fatal transport failure', () => {
        const c = new StreamController<number>({ url: '/server-stream', batchMs: 0 });
        c.start();
        const es = FakeEventSource.last();
        es.emitOpen();
        es.emitFatalError();

        expect(c.getState().status).toBe('error');
        expect(c.getState().error).toBeInstanceOf(Error);
    });

    it('skips malformed events in non-strict mode and keeps streaming', () => {
        const parseErrors: string[] = [];
        const c = new StreamController<{ n: number }>({
            url: '/server-stream',
            batchMs: 0,
            onParseError: (data) => parseErrors.push(data),
        });

        c.start();
        const es = FakeEventSource.last();
        es.emitOpen();
        es.emitMessage('{"n":1}');
        es.emitMessage('not-json');
        es.emitMessage('{"n":2}');
        c.flush();

        expect(c.getState().status).toBe('streaming');
        expect(c.getState().data).toEqual([{ n: 1 }, { n: 2 }]);
        expect(parseErrors).toEqual(['not-json']);
    });

    it('fails fatally on a malformed event in strict mode', () => {
        const c = new StreamController<{ n: number }>({
            url: '/server-stream',
            batchMs: 0,
            strict: true,
        });

        c.start();
        const es = FakeEventSource.last();
        es.emitOpen();
        es.emitMessage('{"n":1}');
        es.emitMessage('not-json');
        c.flush();

        expect(c.getState().status).toBe('error');
        expect(c.getState().error).toBeInstanceOf(Error);
        expect(c.getState().data).toEqual([{ n: 1 }]);
        expect(es.readyState).toBe(FakeEventSource.CLOSED);
    });

    it('listens for a custom event name', () => {
        const c = new StreamController<number>({
            url: '/server-stream',
            batchMs: 0,
            eventName: 'tick',
        });

        c.start();
        const es = FakeEventSource.last();
        es.emitOpen();
        es.emitMessage('1', 'tick');
        es.emitMessage('999', 'message'); // ignored: not the configured event
        es.emitMessage('2', 'tick');
        c.flush();

        expect(c.getState().data).toEqual([1, 2]);
    });

    it('forwards withCredentials to EventSource', () => {
        const c = new StreamController({ url: '/server-stream', withCredentials: true });
        c.start();
        expect(FakeEventSource.last().withCredentials).toBe(true);
    });

    it('parses with a custom parser', () => {
        const c = new StreamController<string>({
            url: '/server-stream',
            batchMs: 0,
            parse: (data) => data.toUpperCase(),
        });
        c.start();
        const es = FakeEventSource.last();
        es.emitOpen();
        es.emitMessage('abc');
        c.flush();
        expect(c.getState().data).toEqual(['ABC']);
    });

    it('caps retained records at maxItems, dropping the oldest', () => {
        const c = new StreamController<number>({
            url: '/server-stream',
            batchMs: 0,
            maxItems: 3,
        });
        c.start();
        const es = FakeEventSource.last();
        es.emitOpen();
        for (const n of [1, 2, 3, 4, 5]) es.emitMessage(String(n));
        c.flush();
        expect(c.getState().data).toEqual([3, 4, 5]);
    });

    it('batches rapid events into a single publish', async () => {
        const c = new StreamController<number>({ url: '/server-stream', batchMs: 16 });
        const listener = jest.fn();
        c.subscribe(listener);

        c.start(); // publish: connecting
        const es = FakeEventSource.last();
        es.emitOpen(); // publish: streaming
        const publishesBeforeData = listener.mock.calls.length;

        es.emitMessage('1');
        es.emitMessage('2');
        es.emitMessage('3');
        await wait(40); // let the single batched flush fire

        expect(listener.mock.calls.length).toBe(publishesBeforeData + 1);
        expect(c.getState().data).toEqual([1, 2, 3]);
    });

    it('notifies subscribers on state changes and stops after unsubscribe', () => {
        const c = new StreamController<number>({ url: '/server-stream', batchMs: 0 });
        const listener = jest.fn();

        const unsubscribe = c.subscribe(listener);
        c.start();
        FakeEventSource.last().emitOpen();
        expect(listener).toHaveBeenCalled();

        const callsBefore = listener.mock.calls.length;
        unsubscribe();
        c.reset();
        expect(listener.mock.calls.length).toBe(callsBefore);
    });

    it('reports status transitions in order for a full run', () => {
        const transitions: string[] = [];
        const c = new StreamController<number>({
            url: '/server-stream',
            batchMs: 0,
            completeEventName: 'done',
            onStatusChange: (s) => transitions.push(s),
        });

        c.start();
        const es = FakeEventSource.last();
        es.emitOpen();
        es.emitMessage('1');
        c.pause();
        c.resume();
        es.emitMessage('', 'done');

        expect(transitions).toEqual([
            'connecting',
            'streaming',
            'paused',
            'streaming',
            'complete',
        ]);
    });
});
