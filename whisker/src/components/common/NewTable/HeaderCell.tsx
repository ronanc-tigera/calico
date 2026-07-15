import { type Header as TableHeader } from '@tanstack/react-table';
import {
    Flex,
    Th as ChakraTh,
    type TableColumnHeaderProps,
} from '@chakra-ui/react';

import { useDataTableContext } from './context';
import Resizer from './Resizer';
import Sorter from './Sorter';

type HeaderCellProps<TData> = TableColumnHeaderProps & {
    // The TanStack header for this column. Pass it and the cell carries the
    // column's size/colSpan automatically and — when the table has a sorted row
    // model — turns into a sort toggle. Omit it for a plain header cell (the
    // common case for action/control columns).
    header?: TableHeader<TData, unknown>;
};

const ariaSort = {
    asc: 'ascending',
    desc: 'descending',
} as const;

// Sorting is gated on the sorted row model actually being wired (client-side
// getSortedRowModel, or manualSorting for server-side): without it a column can
// report getCanSort() while nothing would reorder, so we render a plain,
// non-interactive header cell instead of a misleading toggle.
function isSortable<TData>(header: TableHeader<TData, unknown>) {
    const { table } = header.getContext();

    return (
        (table.options.getSortedRowModel != null ||
            Boolean(table.options.manualSorting)) &&
        header.column.getCanSort()
    );
}

// The table's <th>. Header wraps every plain accessor header in one, passing the
// column's `header` so the cell sizes itself and — once the table has a sorted
// row model — becomes a sort toggle with an indicator.
//
// A column with a non-string `header` renderer composes its own so it can set
// header-cell styling (width, padding, alignment) with props. Pass it the
// header from the renderer's context to make that column sortable too; omit it
// for a plain, non-sortable cell:
//
//   header: ({ table }) => (
//       <HeaderCell width='1%'><SelectAllCheckbox table={table} /></HeaderCell>
//   )
//   header: ({ header }) => <HeaderCell header={header}>Source</HeaderCell>
function HeaderCell<TData>({
    header,
    children,
    ...props
}: HeaderCellProps<TData>) {
    const { stickyHeader } = useDataTableContext();
    const sortable = header ? isSortable(header) : false;
    const sorted = header?.column.getIsSorted() ?? false;
    // Only resizable when the consumer opted in (enableColumnResizing) and the
    // column hasn't opted out (enableResizing: false); getCanResize() ANDs both.
    const resizable = header?.column.getCanResize() ?? false;
    // When resizing is on table-wide, Root's <colgroup> owns every column width
    // (so its last column can flex to fill the container); the header cell must
    // not also set a width or it would pin that column. Otherwise the header
    // carries the width, as before.
    const resizingEnabled = Boolean(
        header?.getContext().table.options.enableColumnResizing,
    );

    return (
        <ChakraTh
            data-slot='table-header-cell'
            data-testid='column-header'
            // position: relative anchors the absolutely-positioned Resizer to
            // this cell's trailing edge. When the header is sticky, position:
            // sticky (with a top offset) does the same anchoring while pinning
            // the cell to the top of the scroll container; zIndex keeps it above
            // the body cells that scroll under it. Set per-cell (not on
            // thead/tr) so it works with the table's collapsed borders and so
            // each cell's own background hides the rows passing beneath.
            position={stickyHeader ? 'sticky' : 'relative'}
            {...(stickyHeader && { top: 0, zIndex: 1 })}
            sx={{ borderBottom: 'none !important' }}
            {...(header && { colSpan: header.colSpan })}
            {...(header &&
                !resizingEnabled && {
                    style: { width: header.getSize() },
                })}
            {...(sortable && {
                'aria-sort': sorted ? ariaSort[sorted] : 'none',
            })}
            {...props}
        >
            {sortable ? (
                <Flex
                    as='button'
                    type='button'
                    onClick={header!.column.getToggleSortingHandler()}
                    align='center'
                    gap={1}
                    w='full'
                    cursor='pointer'
                    userSelect='none'
                    bg='transparent'
                    border={0}
                    p={0}
                    m={0}
                    _focusVisible={{ boxShadow: 'outline' }}
                    // sx={{
                    // font='inherit'
                    color='inherit'
                    letterSpacing='inherit'
                    textTransform='inherit'
                    textAlign='inherit'
                    // }}
                >
                    {children}
                    <Sorter direction={sorted} />
                </Flex>
            ) : (
                children
            )}

            {resizable && header && <Resizer header={header} />}
        </ChakraTh>
    );
}

export default HeaderCell;
