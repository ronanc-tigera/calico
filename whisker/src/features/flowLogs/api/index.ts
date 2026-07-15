import api from '@/api';
import { useSseStream } from '@/api/sseStream/useSseStream';
import { ApiFilterResponse, QueryPage } from '@/types/api';
import { FlowLog } from '@/types/render';
import {
    FilterHintKey,
    FilterHintType,
    FilterHintTypes,
    OmniFilterProperties,
    SelectedOmniFilterValues,
    transformToFlowsFilterQuery,
    transformToQueryPage,
} from '@/utils/omniFilter';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import React from 'react';
import { connectToFlowStream, flowStreamPolicy, parseFlowLog } from '../stream';
import { getTimeInSeconds, transformStartTime } from '../utils';
const getFlowLogs = (queryParams?: Record<string, string>) =>
    api.get<FlowLog[]>('flows', {
        queryParams,
    });

export const useFlowLogs = (queryParams?: Record<string, string>) =>
    useQuery({
        queryKey: ['flowLogs', queryParams],
        queryFn: () => getFlowLogs(queryParams),
    });

export const useDeniedFlowLogsCount = () => {
    return useFlowLogsCount({ action: 'deny' });
};

export const useFlowLogsCount = (queryParams?: Record<string, string>) => {
    const { data: count } = useQuery({
        queryKey: ['flowLogsCount'],
        queryFn: () => getFlowLogs(queryParams),
        select: (data) => data.length, // todo: maybe stats api
    });

    return count;
};

export const fetchFilters = (query: {
    type: FilterHintType;
    pageSize: number;
    page: number;
    filters?: string;
}): Promise<ApiFilterResponse> =>
    api.get('flows-filter-hints', {
        queryParams: query,
    });

export const useInfiniteFilterQuery = (
    filterParam: FilterHintKey,
    query: string | null,
) =>
    useInfiniteQuery<QueryPage, any>({
        queryKey: [filterParam, query],
        initialPageParam: 0,
        queryFn: ({ pageParam }) =>
            fetchFilters({
                page: pageParam as number,
                type: FilterHintTypes[filterParam],
                pageSize: OmniFilterProperties[filterParam].limit ?? 1,
                filters: query ?? undefined,
            }).then((response) =>
                transformToQueryPage(response, pageParam as number),
            ),
        getNextPageParam: (lastPage) => lastPage.nextPage,
        enabled: query !== null,
    });

export const useFlowLogsStream = (
    startTime: number,
    filterHintValues: SelectedOmniFilterValues,
) => {
    const filters = transformToFlowsFilterQuery(filterHintValues);
    const startTimeGte = transformStartTime(startTime);

    const { stream, snapshot } = useSseStream<FlowLog>({
        parse: parseFlowLog,
        policy: flowStreamPolicy,
    });

    // The oldest flow seen for the current window. Pins the window across
    // filter changes so a filter edit re-queries the same time range
    // instead of a fresh relative window.
    const windowAnchor = React.useRef<number | null>(null);
    const previousQuery = React.useRef<{
        filters: string;
        startTimeGte: number;
    } | null>(null);

    const { items } = snapshot;
    React.useEffect(() => {
        if (windowAnchor.current === null && items.length > 0) {
            // Items are newest-first; the last one is the oldest.
            windowAnchor.current = items[items.length - 1].start_time.getTime();
        }
    }, [items]);

    // Every query→stream transition lives here.
    React.useEffect(() => {
        const previous = previousQuery.current;
        previousQuery.current = { filters, startTimeGte };

        if (previous === null) {
            stream.start(connectToFlowStream({ filters, startTimeGte }));
        } else if (previous.startTimeGte !== startTimeGte) {
            // A new start-time selection is a new window: drop the anchor.
            windowAnchor.current = null;
            stream.start(connectToFlowStream({ filters, startTimeGte }));
        } else if (previous.filters !== filters) {
            // Keep the window pinned to the anchor; before any flow has
            // arrived, fall back to the selected relative window.
            stream.start(
                connectToFlowStream({
                    filters,
                    startTimeGte:
                        windowAnchor.current !== null
                            ? getTimeInSeconds(windowAnchor.current)
                            : startTimeGte,
                }),
            );
        } else {
            // Unchanged query re-run: StrictMode's dev unmount/remount
            // cycle destroyed the stream; revive it from the bookmark.
            stream.resume();
        }
    }, [filters, startTimeGte, stream]);

    return {
        data: snapshot.items,
        status: snapshot.status,
        error: snapshot.error,
        totalItems: snapshot.totalReceived,
        droppedCount: snapshot.droppedCount,
        pause: stream.pause,
        resume: stream.resume,
    };
};
