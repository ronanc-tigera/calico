import * as React from 'react';
import type { Row, Table } from '@tanstack/react-table';
import { Box, type BoxProps, Table as ChakraTable } from '@chakra-ui/react';
import ColGroup from './ColGroup';
import { DataTableContext, type DataTableContextValue } from './context';

type RootProps<TData> = React.ComponentProps<'table'> & {
    table: Table<TData>;
    // Table-wide config for the expanded detail panel. Lives here (not on Body)
    // so it reaches Row via context instead of being drilled, and so TData is
    // inferred from `table` — the callback's row is typed without annotation.
    renderSubComponent?: (row: Row<TData>) => React.ReactNode;
    // Called when a row is clicked or activated from the keyboard. Lives here
    // for the same reasons as renderSubComponent: it reaches Row via context
    // (Body/VirtualBody don't forward it) and its row is typed from `table`.
    // Providing it makes every row interactive; see Row for the behaviour.
    onRowClick?: (
        row: Row<TData>,
        event: React.MouseEvent | React.KeyboardEvent,
    ) => void;
    // Props for the scroll container that wraps the table. Give it a bounded
    // height (e.g. { maxH: 400 }) when using VirtualBody so there is something
    // to scroll and virtualize within.
    containerProps?: BoxProps;
    // Pin the header to the top of the scroll container so it stays visible
    // while the body scrolls under it. On by default; only has a visible effect
    // once the container actually scrolls (a bounded height, e.g. with
    // VirtualBody). Pass false for a header that scrolls away with the body.
    stickyHeader?: boolean;
};

function Root<TData>({
    table,
    renderSubComponent,
    onRowClick,
    containerProps,
    stickyHeader = true,
    children,
    style,
    ...props
}: RootProps<TData>) {
    // Callback ref into state so mounting the container re-renders and lets
    // VirtualBody's virtualizer find it (see scrollElement in context).
    const [scrollElement, setScrollElement] =
        React.useState<HTMLDivElement | null>(null);

    const context = React.useMemo(
        () => ({
            table,
            renderSubComponent,
            onRowClick,
            scrollElement,
            stickyHeader,
        }),
        [table, renderSubComponent, onRowClick, scrollElement, stickyHeader],
    );

    // Resizing is on only when the consumer opted in and at least one column
    // can resize. When it is, switch to table-layout: fixed so a <colgroup> can
    // drive resizable widths (see ColGroup) and columns actually shrink/grow on
    // drag instead of the browser reflowing to content. The table fills its
    // container (width: 100%) with the last column taking up the slack, and
    // minWidth = the summed column widths so it scrolls once the columns
    // outgrow the container. Off by default, so a plain table is untouched.
    const resizable = table
        .getAllLeafColumns()
        .some((column) => column.getCanResize());

    return (
        <DataTableContext.Provider
            value={context as DataTableContextValue<unknown>}
        >
            <Box
                ref={setScrollElement}
                data-slot='table-container'
                overflowY='auto'
                overflowX={resizable ? 'auto' : undefined}
                {...containerProps}
            >
                <ChakraTable
                    data-slot='table'
                    {...props}
                    variant='tanstack'
                    style={
                        resizable
                            ? {
                                  tableLayout: 'fixed',
                                  width: '100%',
                                  minWidth: table.getTotalSize(),
                                  ...style,
                              }
                            : style
                    }
                >
                    {resizable && <ColGroup />}
                    {children}
                </ChakraTable>
            </Box>
        </DataTableContext.Provider>
    );
}

export default Root;
