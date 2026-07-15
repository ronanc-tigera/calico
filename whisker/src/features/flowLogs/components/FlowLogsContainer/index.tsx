import { VirtualizedRow } from '@/libs/tigera/ui-components/components/common/DataTable';
import { StreamError } from '@/api/sseStream';
import { FlowLog } from '@/types/render';
import React from 'react';
import FlowLogsList from '../FlowLogsList';
import { TableSkeleton } from '@/libs/tigera/ui-components/components/common';
import { useFlowLogsHeightOffset } from '../../hooks';

export type FlowLogsContainerProps = {
    flowLogs: FlowLog[];
    error: StreamError | null;
    onRowClicked: (row: VirtualizedRow) => void;
    onSortClicked: () => void;
    isFetching: boolean;
    maxStartTime: number;
    totalItems: number;
    hasActiveFilters: boolean;
};

const FlowLogsContainer: React.FC<FlowLogsContainerProps> = ({
    flowLogs,
    error,
    onRowClicked,
    onSortClicked,
    isFetching,
    maxStartTime,
    totalItems,
    hasActiveFilters,
}) => {
    const heightOffset = useFlowLogsHeightOffset();

    return isFetching ? (
        <TableSkeleton
            skeletonsPerStack={20}
            data-testid='flow-logs-loading-skeleton'
        />
    ) : (
        <FlowLogsList
            flowLogs={flowLogs}
            isLoading={false}
            error={error}
            onRowClicked={onRowClicked}
            onSortClicked={onSortClicked}
            maxStartTime={maxStartTime}
            heightOffset={heightOffset}
            totalItems={totalItems}
            hasActiveFilters={hasActiveFilters}
        />
    );
};

export default FlowLogsContainer;
