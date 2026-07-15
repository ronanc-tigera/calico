# Server stream (EventSource / SSE)

Logic for consuming a long-lived **Server-Sent Events** endpoint
(`/server-stream`) and exposing it to React as controllable, observable state.
Built on the platform `EventSource` — no external streaming/state library.

> This is the EventSource variant of the stream module. A `fetch` +
> `ReadableStream` variant with the same public API lives in `../stream`; the
> two are drop-in interchangeable. See **Transport trade-offs** below.

## What's here

| File | Responsibility |
| --- | --- |
| `StreamController.ts` | Framework-agnostic engine: EventSource transport, per-event parsing, state machine. Also an external store (`subscribe` / `getSnapshot`). |
| `useServerStream.ts` | React hook binding a controller to a component via `useSyncExternalStore`. |
| `types.ts` | `StreamStatus`, `StreamState`, `StreamOptions`. |
| `index.ts` | Public exports. |

## Controls & state machine

```
idle ──start──▶ connecting ──open──▶ streaming ⇄ paused
                    ▲                    │
     transient error│                    ├──stop─────▶ stopped
     (auto-reconnect)└─────────────────── ┤
                                          ├──done─────▶ complete  (server sentinel)
                                          └──fatal────▶ error
```

- **start** — open the connection and begin a fresh run (clears previous data).
  Ignored while active; use `resume` to continue a paused stream.
- **pause** — stop delivering events to consumers. The connection stays open;
  events that arrive are buffered and released on resume (see below).
- **resume** — deliver everything buffered during the pause, then continue.
- **stop** — close the connection; collected data is retained (records withheld
  during a pause are discarded).
- **reset** — close, clear all data, return to `idle`.

## Design decisions

- **`EventSource`, per the request.** The browser handles SSE framing, so
  parsing is one call per event's `data` (default `JSON.parse`, override via
  `parse`). Configure the event name with `eventName`, cross-origin credentials
  with `withCredentials`.
- **Pause is a client-side buffer, not backpressure.** EventSource has no flow
  control, so pausing keeps the socket open and *withholds* events (buffering
  them, bounded by `maxItems`) until resume. No records are lost across a
  pause/resume — but, unlike a `fetch` reader, the server is **not** throttled
  while paused.
- **Reconnects are transparent.** EventSource auto-reconnects after a dropped
  connection. A transient `error` (readyState `CONNECTING`) surfaces as a
  return to `connecting` → `streaming`, without clobbering an explicit `pause`.
  A fatal `error` (readyState `CLOSED`) moves the stream to `error`.
- **`complete` needs a server sentinel.** SSE has no native end-of-stream, so
  `complete` is only reached when the server emits the event named by
  `completeEventName`. Otherwise a stream ends via `stop`/`reset`/`error`.
- **Immutable, shared snapshots.** A new `StreamState` is produced only when
  something changes, so `useSyncExternalStore` skips renders by reference
  equality — no tearing, no manual `useEffect`/`setState` plumbing.
- **Batched publishing (`batchMs`, default 16ms).** A fast stream would
  otherwise force a render per event. Records are coalesced; status changes
  always publish immediately.
- **Restart-safe.** Every event handler is fenced to the `EventSource` instance
  that registered it, so a stray event from a superseded connection (after
  stop/reset/restart) is ignored.

## Transport trade-offs (vs the `../stream` fetch variant)

| | EventSource (this) | fetch + ReadableStream (`../stream`) |
| --- | --- | --- |
| Pause | client-side buffer (server keeps sending) | real backpressure (server throttled) |
| Reconnect | automatic, built in | manual (would need to re-`start`) |
| Request shape | GET only, `withCredentials`; no headers/body | full `fetch` control (method, headers, body) |
| Wire format | SSE frames (browser-parsed) | anything; defaults to NDJSON |
| End of stream | server sentinel event | native (response body ends) |

## Usage

```tsx
import { useServerStream } from './stream-event-source';

interface Event { id: string; message: string }

function Feed() {
    const { data, status, isActive, isPaused, start, pause, resume, stop, reset } =
        useServerStream<Event>({
            url: '/server-stream',
            completeEventName: 'end', // optional: server signals it's done
            maxItems: 1000,
        });

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
controller.start();
```

> Options are captured once at mount. To stream from a different `url`, remount
> the component (e.g. via a React `key`) or instantiate a `StreamController`
> yourself.
