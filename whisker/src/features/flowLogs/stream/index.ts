import { StreamConnect, StreamPolicy } from '@/api/sseStream';
import { FlowLog as ApiFlowLog } from '@/types/api';
import { FlowLog } from '@/types/render';
import { createEventSource } from '@/utils';
import {
    buildStreamPath,
    getTimeInSeconds,
    transformFlowLogsResponse,
} from '../utils';

export type FlowStreamQuery = {
    /** Serialized filter set, from transformToFlowsFilterQuery. */
    filters: string;
    /**
     * Window start in seconds for a fresh stream: negative for a relative
     * window (e.g. -300 = the last five minutes), positive for absolute
     * epoch seconds (used to pin the window across filter changes),
     * undefined for the server default.
     */
    startTimeGte?: number;
};

export const parseFlowLog = (raw: string): FlowLog =>
    transformFlowLogsResponse(JSON.parse(raw) as ApiFlowLog);

/**
 * Connection recipe for one flow-stream query. A reconnect or resume
 * passes the bookmark (the newest end_time already flushed, in millis) so
 * the stream picks up where it left off instead of re-fetching the whole
 * window.
 */
export const connectToFlowStream =
    ({ filters, startTimeGte }: FlowStreamQuery): StreamConnect =>
    (bookmark) =>
        createEventSource(
            buildStreamPath(
                bookmark !== null ? getTimeInSeconds(bookmark) : startTimeGte,
                filters,
            ),
        );

/**
 * Everything flow-shaped that SseStream needs: resume from the newest
 * end_time seen (so pause/resume and reconnects neither gap nor duplicate),
 * identify flows by their natural key rather than the render-time uuid, and
 * keep the list newest-first.
 */
export const flowStreamPolicy: StreamPolicy<FlowLog> = {
    bookmark: (flow) => flow.end_time.getTime(),
    dedupeKey: (flow) =>
        [
            flow.start_time.getTime(),
            flow.end_time.getTime(),
            flow.source_namespace,
            flow.source_name,
            flow.dest_namespace,
            flow.dest_name,
            flow.protocol,
            flow.dest_port,
            flow.reporter,
            flow.action,
        ].join('|'),
    compare: (a, b) => b.start_time.getTime() - a.start_time.getTime(),
};
