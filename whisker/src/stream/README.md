# Server stream

Logic for consuming a long-lived streaming endpoint (`/server-stream`) and
exposing it to React as controllable, observable state. Built from scratch on
web platform primitives — no external streaming/state library.

## What's here

| File | Responsibility |
| --- | --- |
| `StreamController.ts` | Framework-agnostic engine: transport, parsing, state machine. Also an external store (`subscribe` / `getSnapshot`). |
| `useServerStream.ts` | React hook binding a controller to a component via `useSyncExternalStore`. |
| `types.ts` | `StreamStatus`, `StreamState`, `StreamOptions`. |
| `index.ts` | Public exports. |

## Controls & state machine

```
idle ──start──▶ connecting ──▶ streaming ⇄ paused
                                  │  │
                                  │  └──stop──▶ stopped
                                  ├──(eof)────▶ complete
                                  └──(error)──▶ error
```

- **start** — open the connection and begin a fresh run (clears previous data).
  Ignored while active; use `resume` to continue a paused stream.
- **pause** — stop pulling from the socket. This is *real backpressure*: a
  well-behaved server is throttled by TCP flow control, the connection stays
  open, and nothing is buffered client-side beyond the one in-flight chunk.
- **resume** — start pulling again, emitting anything held at the pause point.
- **stop** — abort the connection; collected data is retained.
- **reset** — abort, clear all data, return to `idle`.

## Design decisions

- **`fetch` + `ReadableStream` + `AbortController`, not `EventSource`.**
  `EventSource` can't express pause (no backpressure), can't abort a read
  without closing, and can't send headers/POST bodies. The fetch reader gives
  precise control over all four operations.
- **Immutable, shared snapshots.** A new `StreamState` object is produced only
  when something changes, so `useSyncExternalStore` skips renders by reference
  equality — no tearing, no manual `useEffect`/`setState` plumbing.
- **Batched publishing (`batchMs`, default 16ms).** A fast stream would
  otherwise force a render per record. Records are coalesced; status changes
  always publish immediately.
- **Restart-safe.** A generation counter fences an in-flight read loop against
  `reset`/`stop`/`start`, so rapid control sequences can't cross wires.
- **NDJSON by default, pluggable `parse`.** Records split on newlines and
  default to `JSON.parse`; override `parse` for plain text, SSE frames, etc.
  Malformed records are skipped by default (`onParseError`) or fatal (`strict`).

## Usage

```tsx
import { useServerStream } from './stream';

interface Event { id: string; message: string }

function Feed() {
    const { data, status, isActive, isPaused, start, pause, resume, stop, reset } =
        useServerStream<Event>({ url: '/server-stream', maxItems: 1000 });

    return (
        <>
            <div>status: {status} ({data.length})</div>
            <button onClick={start} disabled={isActive}>Start</button>
            <button onClick={isPaused ? resume : pause} disabled={!isActive}>
                {isPaused ? 'Resume' : 'Pause'}
            </button>
            <button onClick={stop} disabled={!isActive}>Stop</button>
            <button onClick={reset}>Reset</button>
            <ul>{data.map((e) => <li key={e.id}>{e.message}</li>)}</ul>
        </>
    );
}
```

Without React, drive the controller directly:

```ts
const controller = new StreamController<Event>({ url: '/server-stream' });
controller.subscribe(() => render(controller.getState()));
await controller.start();
```

> Options are captured once at mount. To stream from a different `url`, remount
> the component (e.g. via a React `key`) or instantiate a `StreamController`
> yourself.
