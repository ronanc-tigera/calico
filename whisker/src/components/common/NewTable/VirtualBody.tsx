import * as React from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Tbody as ChakraTbody } from '@chakra-ui/react';
import type { Row as RowType } from '@tanstack/react-table';
import { useDataTableContext } from './context';
import Row from './Row';

// What a children render prop must return: an element that forwards these
// measurement props to its <tr> — i.e. a <DataTable.Row> (or a wrapper that
// spreads them through). VirtualBody clones them in per virtual row.
type VirtualRowElement = React.ReactElement<{
    measureRef?: React.Ref<HTMLTableRowElement>;
    'data-index'?: number;
}>;

type VirtualBodyProps<TData> = Omit<
    React.ComponentProps<'tbody'>,
    'children'
> & {
    // Starting height estimate per row; refined by real measurements as rows
    // render, so it need not be exact.
    estimateRowHeight?: number;
    // Rows rendered beyond the visible window on each side, to cover fast
    // scrolling before new rows paint.
    overscan?: number;
    // Own what a row is without owning the windowing: called once per visible
    // row, so per-row props (styling, animation classes) attach here. Unlike
    // Body, children must be a function — the virtualizer decides which rows
    // exist, so pre-rendered children can't work.
    children?: (row: RowType<TData>) => VirtualRowElement;
};

// Drop-in alternative to Body that only renders the rows in (and near) the
// viewport, so large data sets stay fast. Keeps the semantic <table>: the
// window is padded with spacer rows above and below rather than absolute
// positioning, so column widths and the header still line up. Requires Root's
// scroll container to have a bounded height (see Root's containerProps).
function VirtualBody<TData>({
    estimateRowHeight = 35,
    overscan = 10,
    children,
    ...props
}: VirtualBodyProps<TData>) {
    const { table, scrollElement } = useDataTableContext<TData>();
    const { rows } = table.getRowModel();

    const virtualizer = useVirtualizer({
        count: rows.length,
        getScrollElement: () => scrollElement,
        estimateSize: () => estimateRowHeight,
        overscan,
    });

    const virtualRows = virtualizer.getVirtualItems();
    const colSpan = table.getAllLeafColumns().length;

    const paddingTop = virtualRows.length ? virtualRows[0].start : 0;
    const paddingBottom = virtualRows.length
        ? virtualizer.getTotalSize() - virtualRows[virtualRows.length - 1].end
        : 0;

    return (
        <ChakraTbody data-slot='table-body' {...props}>
            {paddingTop > 0 && (
                <tr aria-hidden data-slot='table-virtual-spacer'>
                    <td colSpan={colSpan} style={{ height: paddingTop }} />
                </tr>
            )}

            {virtualRows.map((virtualRow) => {
                const row = rows[virtualRow.index];

                return React.cloneElement(
                    children ? children(row) : <Row row={row} />,
                    {
                        key: row.id,
                        'data-index': virtualRow.index,
                        measureRef: virtualizer.measureElement,
                    },
                );
            })}

            {paddingBottom > 0 && (
                <tr aria-hidden data-slot='table-virtual-spacer'>
                    <td colSpan={colSpan} style={{ height: paddingBottom }} />
                </tr>
            )}
        </ChakraTbody>
    );
}

export default VirtualBody;
