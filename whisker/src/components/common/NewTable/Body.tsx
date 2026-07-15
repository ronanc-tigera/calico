import * as React from 'react';
import type { Table } from '@tanstack/react-table';
import { useDataTableContext } from './context';
import Row from './Row';
import { Tbody as ChakraTbody } from '@chakra-ui/react';

type BodyRowsProps<TData> = {
    table: Table<TData>;
    // Whether a column is mid-resize. Read by MemoRows' comparator, not the
    // render itself: the rows look the same either way, it just gates freezing.
    isResizing: boolean;
};

function BodyRows<TData>({ table }: BodyRowsProps<TData>) {
    const { rows } = table.getRowModel();

    return (
        <>
            {rows.map((row) => (
                <Row key={row.id} row={row} />
            ))}
        </>
    );
}

// While a column is being dragged, the sizing state changes on every pointer
// move, re-rendering the whole subtree. Freeze the rows for the duration so a
// large table doesn't re-render every cell per frame (TanStack's column-sizing
// performance guidance). Column widths still track the drag because they're
// driven by the <colgroup> in Root, which sits outside this frozen subtree.
// Not resizing → always re-render, so sorting/expansion/data changes flow
// through exactly as an unmemoized body would.
const MemoRows = React.memo(
    BodyRows,
    (_prev, next) => next.isResizing,
) as typeof BodyRows;

// With no children, Body renders every row itself — the common case. Pass
// children to own the row loop instead (map table.getRowModel().rows to
// <DataTable.Row>s), e.g. to attach per-row styling/animation props. Custom
// children bypass the resize-freeze memoization below, so a very large table
// re-renders its rows while a column is dragged — prefer the default loop
// unless you need the control.
function Body({ children, ...props }: React.ComponentProps<'tbody'>) {
    const { table } = useDataTableContext();
    const isResizing = Boolean(
        table.getState().columnSizingInfo.isResizingColumn,
    );

    return (
        <ChakraTbody data-slot='table-body' {...props}>
            {children ?? <MemoRows table={table} isResizing={isResizing} />}
        </ChakraTbody>
    );
}

export default Body;
