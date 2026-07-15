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

import { ReadableStream as NodeReadableStream } from 'node:stream/web';
import { TextDecoder as NodeTextDecoder, TextEncoder as NodeTextEncoder } from 'node:util';

import { StreamController } from './StreamController';

// jsdom does not reliably expose the Web Streams / encoding globals that the
// controller relies on (they exist in a browser). Provide them for the test
// environment without depending on anything in the repo's jest setup.
const g = globalThis as Record<string, unknown>;
if (typeof g.TextEncoder === 'undefined') g.TextEncoder = NodeTextEncoder;
if (typeof g.TextDecoder === 'undefined') g.TextDecoder = NodeTextDecoder;
if (typeof g.ReadableStream === 'undefined') g.ReadableStream = NodeReadableStream;

const encoder = new TextEncoder();

/** Let the async pump loop drain queued reads and any batch timers. */
async function drain(times = 5): Promise<void> {
    for (let i = 0; i < times; i++) {
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
}

/** A ReadableStream a test can feed chunks into on demand. */
function manualStream() {
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    const stream = new ReadableStream<Uint8Array>({
        start(c) {
            controller = c;
        },
    });
    return {
        stream,
        // Tolerate a torn-down stream: once the consumer cancels (e.g. after
        // stop()/reset()) the underlying source is closed and enqueue throws.
        // That is exactly the "server keeps sending after we stopped" case.
        push: (text: string) => {
            try {
                controller.enqueue(encoder.encode(text));
            } catch {
                /* stream already cancelled/closed */
            }
        },
        close: () => controller.close(),
        fail: (err: unknown) => controller.error(err),
    };
}

/** A ReadableStream pre-loaded with `chunks` that closes immediately. */
function fixedStream(chunks: string[]) {
    return new ReadableStream<Uint8Array>({
        start(c) {
            for (const chunk of chunks) c.enqueue(encoder.encode(chunk));
            c.close();
        },
    });
}

function mockFetch(response: Partial<Response> & { body: ReadableStream<Uint8Array> | null }) {
    const fetchMock = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        ...response,
    });
    (globalThis as unknown as { fetch: typeof fetch }).fetch =
        fetchMock as unknown as typeof fetch;
    return fetchMock;
}

afterEach(() => {
    jest.restoreAllMocks();
});

describe('StreamController', () => {
    it('starts idle', () => {
        const c = new StreamController({ url: '/server-stream' });
        expect(c.getState()).toEqual({ status: 'idle', data: [], error: null });
    });

    it('streams NDJSON records and completes when the server closes', async () => {
        mockFetch({ body: fixedStream(['{"n":1}\n{"n":2}\n', '{"n":3}\n']) });
        const c = new StreamController<{ n: number }>({ url: '/server-stream', batchMs: 0 });

        await c.start();
        await drain();

        expect(c.getState().status).toBe('complete');
        expect(c.getState().data).toEqual([{ n: 1 }, { n: 2 }, { n: 3 }]);
    });

    it('emits a trailing record with no final newline', async () => {
        mockFetch({ body: fixedStream(['{"n":1}\n{"n":2}']) });
        const c = new StreamController<{ n: number }>({ url: '/server-stream', batchMs: 0 });

        await c.start();
        await drain();

        expect(c.getState().data).toEqual([{ n: 1 }, { n: 2 }]);
    });

    it('reassembles records split across chunk boundaries', async () => {
        const m = manualStream();
        mockFetch({ body: m.stream });
        const received: number[] = [];
        const c = new StreamController<number>({
            url: '/server-stream',
            batchMs: 0,
            onData: (x) => received.push(x),
        });

        await c.start();
        m.push('1\n2\n3'); // "3" is incomplete
        await drain();
        expect(received).toEqual([1, 2]);

        m.push('4\n5\n'); // completes "34"
        await drain();
        expect(received).toEqual([1, 2, 34, 5]);
    });

    it('pauses via backpressure and resumes without losing data', async () => {
        const m = manualStream();
        mockFetch({ body: m.stream });
        const received: number[] = [];
        const c = new StreamController<number>({
            url: '/server-stream',
            batchMs: 0,
            onData: (x) => received.push(x),
        });

        await c.start();
        m.push('1\n2\n');
        await drain();
        expect(received).toEqual([1, 2]);

        c.pause();
        expect(c.getState().status).toBe('paused');

        // Data pushed while paused must not be delivered...
        m.push('3\n4\n');
        await drain();
        expect(received).toEqual([1, 2]);

        // ...until resume, which delivers the buffered records.
        c.resume();
        expect(c.getState().status).toBe('streaming');
        await drain();
        expect(received).toEqual([1, 2, 3, 4]);
    });

    it('stops and retains collected data', async () => {
        const m = manualStream();
        mockFetch({ body: m.stream });
        const c = new StreamController<number>({ url: '/server-stream', batchMs: 0 });

        await c.start();
        m.push('1\n2\n');
        await drain();

        c.stop();
        expect(c.getState().status).toBe('stopped');
        expect(c.getState().data).toEqual([1, 2]);

        // Anything the server sends after stop is ignored.
        m.push('3\n');
        await drain();
        expect(c.getState().data).toEqual([1, 2]);
    });

    it('resets to idle and clears data', async () => {
        const m = manualStream();
        mockFetch({ body: m.stream });
        const c = new StreamController<number>({ url: '/server-stream', batchMs: 0 });

        await c.start();
        m.push('1\n2\n');
        await drain();
        expect(c.getState().data).toEqual([1, 2]);

        c.reset();
        expect(c.getState()).toEqual({ status: 'idle', data: [], error: null });
    });

    it('start() begins a fresh run after a previous stream stopped', async () => {
        mockFetch({ body: fixedStream(['1\n2\n']) });
        const c = new StreamController<number>({ url: '/server-stream', batchMs: 0 });

        await c.start();
        await drain();
        expect(c.getState().data).toEqual([1, 2]);

        mockFetch({ body: fixedStream(['9\n']) });
        await c.start();
        await drain();
        expect(c.getState().data).toEqual([9]); // not [1, 2, 9]
    });

    it('start() is a no-op while already active', async () => {
        const m = manualStream();
        const fetchMock = mockFetch({ body: m.stream });
        const c = new StreamController<number>({ url: '/server-stream', batchMs: 0 });

        await c.start();
        await c.start(); // ignored: already streaming
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('skips malformed records in non-strict mode and keeps streaming', async () => {
        mockFetch({ body: fixedStream(['{"n":1}\n', 'not-json\n', '{"n":2}\n']) });
        const parseErrors: string[] = [];
        const c = new StreamController<{ n: number }>({
            url: '/server-stream',
            batchMs: 0,
            onParseError: (line) => parseErrors.push(line),
        });

        await c.start();
        await drain();

        expect(c.getState().status).toBe('complete');
        expect(c.getState().data).toEqual([{ n: 1 }, { n: 2 }]);
        expect(parseErrors).toEqual(['not-json']);
    });

    it('fails fatally on a malformed record in strict mode', async () => {
        mockFetch({ body: fixedStream(['{"n":1}\n', 'not-json\n', '{"n":2}\n']) });
        const c = new StreamController<{ n: number }>({
            url: '/server-stream',
            batchMs: 0,
            strict: true,
        });

        await c.start();
        await drain();

        expect(c.getState().status).toBe('error');
        expect(c.getState().error).toBeInstanceOf(Error);
        expect(c.getState().data).toEqual([{ n: 1 }]); // stopped at the bad record
    });

    it('moves to error on a non-OK HTTP response', async () => {
        mockFetch({ ok: false, status: 503, body: null });
        const c = new StreamController({ url: '/server-stream' });

        await c.start();

        expect(c.getState().status).toBe('error');
        expect(c.getState().error?.message).toContain('503');
    });

    it('moves to error when the stream errors mid-flight', async () => {
        const m = manualStream();
        mockFetch({ body: m.stream });
        const c = new StreamController<number>({ url: '/server-stream', batchMs: 0 });

        await c.start();
        m.push('1\n');
        await drain();
        m.fail(new Error('connection reset'));
        await drain();

        expect(c.getState().status).toBe('error');
        expect(c.getState().error?.message).toContain('connection reset');
    });

    it('caps retained records at maxItems, dropping the oldest', async () => {
        mockFetch({ body: fixedStream(['1\n2\n3\n4\n5\n']) });
        const c = new StreamController<number>({
            url: '/server-stream',
            batchMs: 0,
            maxItems: 3,
        });

        await c.start();
        await drain();

        expect(c.getState().data).toEqual([3, 4, 5]);
    });

    it('notifies subscribers on state changes and stops after unsubscribe', async () => {
        mockFetch({ body: fixedStream(['1\n2\n']) });
        const c = new StreamController<number>({ url: '/server-stream', batchMs: 0 });
        const listener = jest.fn();

        const unsubscribe = c.subscribe(listener);
        await c.start();
        await drain();
        expect(listener).toHaveBeenCalled();

        const callsBefore = listener.mock.calls.length;
        unsubscribe();
        c.reset();
        expect(listener.mock.calls.length).toBe(callsBefore);
    });

    it('reports status transitions in order', async () => {
        mockFetch({ body: fixedStream(['1\n']) });
        const transitions: string[] = [];
        const c = new StreamController<number>({
            url: '/server-stream',
            batchMs: 0,
            onStatusChange: (status) => transitions.push(status),
        });

        await c.start();
        await drain();

        expect(transitions).toEqual(['connecting', 'streaming', 'complete']);
    });
});
