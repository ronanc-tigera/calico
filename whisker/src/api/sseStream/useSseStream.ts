import React from 'react';
import { SseStream, SseStreamOptions, StreamSnapshot } from '.';

/**
 * React adapter for SseStream: one stream instance per component, exposed
 * as a useSyncExternalStore snapshot. Options are captured on first render;
 * everything dynamic goes through stream.start.
 */
export const useSseStream = <T>(
    options: SseStreamOptions<T>,
): { stream: SseStream<T>; snapshot: StreamSnapshot<T> } => {
    const streamRef = React.useRef<SseStream<T> | null>(null);
    if (streamRef.current === null) {
        streamRef.current = new SseStream(options);
    }
    const stream = streamRef.current;

    const snapshot = React.useSyncExternalStore(
        stream.subscribe,
        stream.getSnapshot,
    );

    React.useEffect(() => () => stream.destroy(), [stream]);

    return { stream, snapshot };
};
