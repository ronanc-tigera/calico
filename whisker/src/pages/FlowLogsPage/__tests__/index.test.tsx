import { useFlowLogsStream } from '@/features/flowLogs/api';
import { fireEvent, render, screen } from '@/test-utils/helper';
import FlowLogsPage from '..';

import { useOmniFilterData } from '@/hooks/omniFilters';
import { useFlowLogsUrlFilters } from '@/hooks/useFlowLogsUrlFilters';
import { ListOmniFilterKeys, OmniFilterKeys } from '@/utils/omniFilter';
import { act } from 'react';

const MockFlowLogsContainer = {
    onRowClicked: jest.fn(),
    onSortClicked: jest.fn(),
};

jest.mock('@/features/flowLogs/api', () => ({
    useDeniedFlowLogsCount: jest.fn(),
    useFlowLogsCount: jest.fn(),
    useFlowLogsStream: jest.fn(),
}));

jest.mock(
    '@/features/flowLogs/components/FlowLogsList',
    () => () => 'Mock FlowLogsList',
);

jest.mock('@/api', () => ({
    __esModule: true,
    default: { get: jest.fn() },
}));

jest.mock('@/libs/tigera/ui-components/components/common/OmniFilter', () => ({
    ...jest.requireActual(
        '@/libs/tigera/ui-components/components/common/OmniFilter',
    ),
}));

jest.mock('@/hooks/useFlowLogsUrlFilters', () => ({
    useFlowLogsUrlFilters: jest.fn(),
}));

jest.mock('@/hooks/omniFilters', () => ({ useOmniFilterData: jest.fn() }));

jest.mock(
    '@/features/flowLogs/components/FlowLogsContainer',
    () => (props: any) => {
        MockFlowLogsContainer.onRowClicked = props.onRowClicked;
        MockFlowLogsContainer.onSortClicked = props.onSortClicked;
        return <div>Mock FlowLogsContainer</div>;
    },
);

const MockOmniFilters = {
    onReset: jest.fn(),
    onChange: jest.fn(),
    onRequestFilterData: jest.fn(),
    onRequestNextPage: jest.fn(),
};

jest.mock(
    '@/features/flowLogs/components/OmniFilters',
    () =>
        ({
            onReset,
            onChange,
            onRequestFilterData,
            onRequestNextPage,
        }: any) => {
            MockOmniFilters.onReset = onReset;
            MockOmniFilters.onChange = onChange;
            MockOmniFilters.onRequestFilterData = onRequestFilterData;
            MockOmniFilters.onRequestNextPage = onRequestNextPage;
            return <>MockOmniFilters</>;
        },
);

jest.mock('@/hooks', () => ({ useSelectedListOmniFilters: jest.fn() }));

const useStreamStub = {
    pause: jest.fn(),
    resume: jest.fn(),
    data: [],
    error: null,
    status: 'paused' as const,
    totalItems: 0,
    droppedCount: 0,
};

const omniFilterData = {
    namespace: {
        filters: [],
        isLoading: false,
    },
    policy: {
        filters: [],
        isLoading: false,
    },
    source_name: {
        filters: [],
        isLoading: false,
    },
    source_namespace: {
        filters: [],
        isLoading: false,
    },
    dest_name: {
        filters: [],
        isLoading: false,
    },
    dest_namespace: {
        filters: [],
        isLoading: false,
    },
};

describe('FlowLogsPage', () => {
    beforeEach(() => {
        jest.mocked(useFlowLogsStream).mockReturnValue(useStreamStub);
        jest.mocked(useOmniFilterData).mockReturnValue([
            omniFilterData,
            jest.fn(),
        ]);
        jest.mocked(useFlowLogsUrlFilters).mockReturnValue({
            filters: {},
            setFilter: jest.fn(),
            clearFilters: jest.fn(),
            setMultiFilter: jest.fn(),
        });
    });

    it('should click play and call resume', () => {
        const mockResume = jest.fn();
        jest.mocked(useFlowLogsStream).mockReturnValue({
            ...useStreamStub,
            resume: mockResume,
            status: 'paused',
        });

        render(<FlowLogsPage />);

        fireEvent.click(screen.getByRole('button', { name: 'Play' }));

        expect(mockResume).toHaveBeenCalled();
    });

    it('should show play when the stream errors out', () => {
        jest.mocked(useFlowLogsStream).mockReturnValue({
            ...useStreamStub,
            status: 'error',
            error: { failureCount: 3, message: 'disconnected' },
        });

        render(<FlowLogsPage />);

        expect(
            screen.getByRole('button', { name: 'Play' }),
        ).toBeInTheDocument();
    });

    it('should click pause and call pause', () => {
        const mockPause = jest.fn();
        jest.mocked(useFlowLogsStream).mockReturnValue({
            ...useStreamStub,
            pause: mockPause,
            status: 'streaming',
        });

        render(<FlowLogsPage />);

        fireEvent.click(screen.getByRole('button', { name: 'Pause' }));

        expect(mockPause).toHaveBeenCalled();
    });

    it('should show the waiting state', () => {
        jest.mocked(useFlowLogsStream).mockReturnValue({
            ...useStreamStub,
            status: 'waiting',
        });

        render(<FlowLogsPage />);

        expect(screen.getByText('Waiting for flows')).toBeInTheDocument();
    });

    it('should show the cap hint when older flows have been dropped', () => {
        jest.mocked(useFlowLogsStream).mockReturnValue({
            ...useStreamStub,
            status: 'streaming',
            data: [
                { start_time: new Date(), end_time: new Date() },
                { start_time: new Date(), end_time: new Date() },
            ] as any,
            droppedCount: 120,
        });

        render(<FlowLogsPage />);

        expect(
            screen.getByText('Showing the most recent 2 flows'),
        ).toBeInTheDocument();
    });

    it('should show the reconnecting state', () => {
        jest.mocked(useFlowLogsStream).mockReturnValue({
            ...useStreamStub,
            status: 'reconnecting',
        });

        render(<FlowLogsPage />);

        expect(screen.getByText('Reconnecting')).toBeInTheDocument();
    });

    it('should test <OmniFilters /> clears filter params', () => {
        const mockClearFilters = jest.fn();
        jest.mocked(useFlowLogsUrlFilters).mockReturnValue({
            filters: {},
            setFilter: jest.fn(),
            clearFilters: mockClearFilters,
            setMultiFilter: jest.fn(),
        });
        render(<FlowLogsPage />);

        MockOmniFilters.onReset();

        expect(mockClearFilters).toHaveBeenCalledTimes(1);
    });

    it('should test <OmniFilters /> sets a new filter param on change', () => {
        const mockSetFilter = jest.fn();
        jest.mocked(useFlowLogsUrlFilters).mockReturnValue({
            filters: {},
            setFilter: mockSetFilter,
            clearFilters: jest.fn(),
            setMultiFilter: jest.fn(),
        });
        render(<FlowLogsPage />);

        MockOmniFilters.onChange('mock-filter', []);

        expect(mockSetFilter).toHaveBeenCalledWith('mock-filter', []);
    });

    it('should request data for <OmniFilters />', () => {
        const fetchDataMock = jest.fn();
        jest.mocked(useOmniFilterData).mockReturnValue([
            omniFilterData,
            fetchDataMock,
        ]);

        render(<FlowLogsPage />);

        const userText = 'user-text';
        MockOmniFilters.onRequestFilterData({
            filterParam: OmniFilterKeys.dest_namespace,
            searchOption: userText,
        });

        expect(fetchDataMock).toHaveBeenCalledWith(
            ListOmniFilterKeys.dest_namespace,
            JSON.stringify({
                dest_namespaces: [{ type: 'Fuzzy', value: userText }],
            }),
        );
    });

    it('should fetch the next page for <OmniFilters />', () => {
        const filterParam = 'xyz';
        const fetchDataMock = jest.fn();
        jest.mocked(useOmniFilterData).mockReturnValue([
            omniFilterData,
            fetchDataMock,
        ]);
        render(<FlowLogsPage />);

        MockOmniFilters.onRequestNextPage(filterParam);

        expect(fetchDataMock).toHaveBeenCalledWith(filterParam, null);
    });

    it('should show a toast message when opening a row', () => {
        jest.mocked(useFlowLogsStream).mockReturnValue({
            ...useStreamStub,
            status: 'streaming',
        });
        render(<FlowLogsPage />);

        act(() => MockFlowLogsContainer.onRowClicked({}));

        expect(screen.getByText('Flows stream paused')).toBeInTheDocument();
    });

    it('should show resume the stream when clicking the same row', () => {
        const id = '1234';
        jest.mocked(useFlowLogsStream).mockReturnValue({
            ...useStreamStub,
            status: 'streaming',
        });
        const { rerender } = render(<FlowLogsPage />);

        act(() => MockFlowLogsContainer.onRowClicked({ id }));

        jest.mocked(useFlowLogsStream).mockReturnValue({
            ...useStreamStub,
            status: 'paused',
        });

        rerender(<FlowLogsPage />);

        act(() => MockFlowLogsContainer.onRowClicked({ id }));

        expect(screen.getByText('Flows stream resumed.')).toBeInTheDocument();
    });

    it('should not toast when the stream is already paused', () => {
        const id = '1234';
        jest.mocked(useFlowLogsStream).mockReturnValue({
            ...useStreamStub,
            status: 'paused',
        });
        render(<FlowLogsPage />);

        act(() => MockFlowLogsContainer.onRowClicked({ id }));

        expect(
            screen.queryByText('Flows stream resumed.'),
        ).not.toBeInTheDocument();
        expect(
            screen.queryByText('Flows stream paused'),
        ).not.toBeInTheDocument();
    });

    it('should not show a toast message when opening another row', () => {
        jest.mocked(useFlowLogsStream).mockReturnValue({
            ...useStreamStub,
            status: 'paused',
        });
        render(<FlowLogsPage />);

        act(() => MockFlowLogsContainer.onRowClicked({}));

        expect(
            screen.queryByText('Flows stream paused'),
        ).not.toBeInTheDocument();
    });

    it('should close a virtualized row on sort', () => {
        const closeVirtualizedRowMock = jest.fn();
        jest.mocked(useFlowLogsStream).mockReturnValue({
            ...useStreamStub,
            status: 'streaming',
        });
        render(<FlowLogsPage />);

        act(() =>
            MockFlowLogsContainer.onRowClicked({
                closeVirtualizedRow: closeVirtualizedRowMock,
            }),
        );
        act(() => MockFlowLogsContainer.onSortClicked());

        expect(closeVirtualizedRowMock).toHaveBeenCalled();
    });
});
