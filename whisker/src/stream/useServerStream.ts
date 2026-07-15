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

import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';

import { StreamController } from './StreamController';
import type { StreamOptions, StreamState } from './types';

export interface UseServerStreamResult<T> extends StreamState<T> {
    /** Begin a fresh stream (clears previous data). */
    start: () => void;
    /** Pause consumption, holding the connection open. */
    pause: () => void;
    /** Resume a paused stream. */
    resume: () => void;
    /** Stop and close the connection, retaining collected data. */
    stop: () => void;
    /** Abort, clear all data, and return to `idle`. */
    reset: () => void;

    /** `true` while connecting, streaming, or paused. */
    isActive: boolean;
    isStreaming: boolean;
    isPaused: boolean;
    /** Number of records collected so far. */
    count: number;
}

/**
 * React binding for {@link StreamController}. Owns a single controller for the
 * lifetime of the component, subscribes the component to its state via
 * `useSyncExternalStore`, and exposes stable control callbacks.
 *
 * ```tsx
 * const { data, status, isActive, start, pause, resume, stop, reset } =
 *     useServerStream<LogLine>({ url: '/server-stream' });
 * ```
 *
 * Note: options are captured once, when the component mounts. To stream from a
 * different `url`, either remount the component (e.g. via a `key`) or drive a
 * {@link StreamController} instance yourself.
 */
export function useServerStream<T = unknown>(
    options: StreamOptions<T>,
): UseServerStreamResult<T> {
    // One controller per hook instance, created lazily and kept for the
    // lifetime of the component. `options` is intentionally read only on the
    // first render (see the note above).
    const optionsRef = useRef(options);
    const controllerRef = useRef<StreamController<T> | null>(null);
    if (controllerRef.current === null) {
        controllerRef.current = new StreamController<T>(optionsRef.current);
    }
    const controller = controllerRef.current;

    const state = useSyncExternalStore(
        controller.subscribe,
        controller.getSnapshot,
        controller.getSnapshot,
    );

    // Tear the stream down when the component unmounts.
    useEffect(() => () => controller.dispose(), [controller]);

    const start = useCallback(() => {
        void controller.start();
    }, [controller]);
    const pause = useCallback(() => controller.pause(), [controller]);
    const resume = useCallback(() => controller.resume(), [controller]);
    const stop = useCallback(() => controller.stop(), [controller]);
    const reset = useCallback(() => controller.reset(), [controller]);

    return {
        ...state,
        start,
        pause,
        resume,
        stop,
        reset,
        isActive:
            state.status === 'connecting' ||
            state.status === 'streaming' ||
            state.status === 'paused',
        isStreaming: state.status === 'streaming',
        isPaused: state.status === 'paused',
        count: state.data.length,
    };
}
