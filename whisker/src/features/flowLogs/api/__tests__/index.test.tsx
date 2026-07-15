import api from '@/api';
import {
    renderHook,
    renderHookWithQueryClient,
    waitFor,
} from '@/test-utils/helper';
import { createEventSource } from '@/utils';
import {
    FilterHintTypes,
    ListOmniFilterKeys,
    transformToFlowsFilterQuery,
} from '@/utils/omniFilter';
import { act } from 'react';
import {
    useDeniedFlowLogsCount,
    useFlowLogs,
    useFlowLogsStream,
    useInfiniteFilterQuery,
} from '..';

jest.mock('@/api', () => ({
    __esModule: true,
    default: {
        get: jest.fn().mockReturnValue([]),
    },
}));

jest.mock('@/utils', () => ({
    createEventSource: jest.fn(),
}));

jest.mock('@/utils/omniFilter', () => ({
    ...jest.requireActual('@/utils/omniFilter'),
    transformToFlowsFilterQuery: jest.fn(),
}));

describe('useFlowLogs', () => {
    it('should call api get with the expected params', () => {
        renderHookWithQueryClient(useFlowLogs);

        expect(api.get).toHaveBeenCalledWith('flows', {
            queryParams: undefined,
        });
    });
});

describe('useDeniedFlowLogsCount', () => {
    it('should return the count of denied flow logs', async () => {
        jest.mocked(api.get).mockResolvedValueOnce(['foo', 'bar']);

        const { result } = renderHookWithQueryClient(useDeniedFlowLogsCount);

        await waitFor(() => expect(result.current).toEqual(2));
    });
});

describe('useInfiniteFilterQuery', () => {
    it('should return the expected response', async () => {
        const filterString = 'filter-query-string';
        const items = [
            {
                label: 'foo',
                value: 'foo',
            },
        ];
        jest.mocked(api.get).mockResolvedValue({
            items,
            total: {
                totalResults: 1,
            },
        });

        const { result } = renderHookWithQueryClient(() =>
            useInfiniteFilterQuery(
                ListOmniFilterKeys.source_namespace,
                filterString,
            ),
        );

        expect(api.get).toHaveBeenCalledWith('flows-filter-hints', {
            queryParams: {
                filters: filterString,
                type: FilterHintTypes.source_namespace,
                pageSize: 20,
                page: 0,
            },
        });

        await waitFor(() =>
            expect((result.current as any).data).toEqual({
                pageParams: [0],
                pages: [
                    {
                        items,
                        total: 1,
                        currentPage: 0,
                        nextPage: 1,
                    },
                ],
            }),
        );
    });
});

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

    emit(flow: unknown) {
        this.onmessage?.({ data: JSON.stringify(flow) });
    }
}

// Integration tests: the real useFlowLogsStream over the real SseStream,
// with only the EventSource transport faked.
describe('useFlowLogsStream', () => {
    let sources: FakeEventSource[];

    const renderStreamHook = (startTime = 15, filters: any = {}) =>
        renderHook(
            ({ startTime, filters }) => useFlowLogsStream(startTime, filters),
            { initialProps: { startTime, filters } },
        );

    const emitFlow = (
        source: FakeEventSource,
        { start, end }: { start: number; end: number },
    ) =>
        act(() =>
            source.emit({
                start_time: new Date(start).toISOString(),
                end_time: new Date(end).toISOString(),
            }),
        );

    beforeEach(() => {
        jest.useFakeTimers();
        sources = [];
        jest.mocked(createEventSource).mockImplementation((path: string) => {
            const source = new FakeEventSource(path);
            sources.push(source);
            return source as unknown as EventSource;
        });
        jest.mocked(transformToFlowsFilterQuery).mockReturnValue('');
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    it('starts the stream with the selected relative window', () => {
        const { result } = renderStreamHook(15);

        expect(createEventSource).toHaveBeenCalledWith(
            'flows?watch=true&startTimeGte=-900',
        );
        expect(result.current.status).toEqual('connecting');
    });

    it('moves through waiting and streaming as flows arrive', () => {
        const { result } = renderStreamHook();

        act(() => sources[0].onopen?.());
        expect(result.current.status).toEqual('waiting');

        const start = Date.now() - 30000;
        emitFlow(sources[0], { start, end: start + 1000 });
        expect(result.current.status).toEqual('streaming');
        expect(result.current.data).toEqual([]);

        act(() => jest.advanceTimersByTime(1000));
        expect(result.current.data).toHaveLength(1);
        expect(result.current.data[0].start_time).toEqual(new Date(start));
        expect(result.current.totalItems).toEqual(1);
    });

    it('pins the window to the oldest flow when filters change', () => {
        const { rerender } = renderStreamHook();
        act(() => sources[0].onopen?.());
        const start = Date.now() - 30000;
        emitFlow(sources[0], { start, end: start + 1000 });
        act(() => jest.advanceTimersByTime(1000));

        jest.mocked(transformToFlowsFilterQuery).mockReturnValue('fake-query');
        rerender({ startTime: 15, filters: { source_name: ['foo'] } });

        expect(sources).toHaveLength(2);
        expect(sources[0].closed).toEqual(true);
        expect(sources[1].url).toEqual(
            `flows?watch=true&filters=fake-query&startTimeGte=${Math.round(start / 1000)}`,
        );
    });

    it('falls back to the relative window when no flow has arrived yet', () => {
        const { rerender } = renderStreamHook();

        jest.mocked(transformToFlowsFilterQuery).mockReturnValue('fake-query');
        rerender({ startTime: 15, filters: { source_name: ['foo'] } });

        expect(sources[1].url).toEqual(
            'flows?watch=true&filters=fake-query&startTimeGte=-900',
        );
    });

    it('starts a fresh window when the start time changes', () => {
        const { rerender } = renderStreamHook(15);
        act(() => sources[0].onopen?.());
        const start = Date.now() - 30000;
        emitFlow(sources[0], { start, end: start + 1000 });
        act(() => jest.advanceTimersByTime(1000));

        rerender({ startTime: 30, filters: {} });

        expect(sources[1].url).toEqual('flows?watch=true&startTimeGte=-1800');
    });

    it('resumes from the newest flushed flow after a pause', () => {
        const { result } = renderStreamHook();
        act(() => sources[0].onopen?.());
        const start = Date.now() - 30000;
        const end = start + 1000;
        emitFlow(sources[0], { start, end });
        act(() => jest.advanceTimersByTime(1000));

        act(() => result.current.pause());
        expect(result.current.status).toEqual('paused');

        act(() => result.current.resume());

        expect(sources[1].url).toEqual(
            `flows?watch=true&startTimeGte=${Math.round(end / 1000)}`,
        );
        expect(result.current.data).toHaveLength(1);
        expect(result.current.status).toEqual('connecting');
    });
});
