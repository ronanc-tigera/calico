import * as React from 'react';
import {
    getCoreRowModel,
    useReactTable,
    type ExpandedState,
    type OnChangeFn,
    type TableOptions,
} from '@tanstack/react-table';
import Cell from './Cell';

export type UseDataTableOptions<TData> = Omit<
    TableOptions<TData>,
    'getCoreRowModel'
> &
    Partial<Pick<TableOptions<TData>, 'getCoreRowModel'>> & {
        // Expansion policy. Default: expanding a row collapses any other
        // (single-row expansion, matching the old DataTable). Set true to let
        // several rows stay open at once. Only applies while useDataTable
        // manages expansion — pass state.expanded / onExpandedChange yourself
        // to take full control and this is ignored.
        enableMultiRowExpansion?: boolean;
    };

// Thin wrapper over useReactTable that applies our defaults. Most features
// (sorting, selection, ...) are opted into by the consumer via the
// corresponding row models / options. Expansion is the one policy we own a
// default for: single-row expansion, overridable with enableMultiRowExpansion.
export function useDataTable<TData>({
    enableMultiRowExpansion = false,
    ...options
}: UseDataTableOptions<TData>) {
    const [expanded, setExpanded] = React.useState<ExpandedState>(
        () => options.initialState?.expanded ?? {},
    );

    // Step back entirely if the consumer drives expansion themselves.
    const manageExpansion =
        options.state?.expanded === undefined &&
        options.onExpandedChange === undefined;

    const onExpandedChange: OnChangeFn<ExpandedState> = (updater) =>
        setExpanded((old) => {
            const next = typeof updater === 'function' ? updater(old) : updater;

            if (enableMultiRowExpansion || next === true || old === true) {
                return next;
            }

            // Single-row: if this change opened a new row, keep only that row;
            // a collapse (no newly-opened row) falls through unchanged.
            const openedRow = Object.keys(next).find(
                (id) => next[id] && !(old as Record<string, boolean>)[id],
            );

            return openedRow ? { [openedRow]: true } : next;
        });

    return useReactTable({
        getCoreRowModel: getCoreRowModel(),
        ...options,
        // Column resizing is opt-in, like our other features. TanStack enables
        // it by default (getCanResize() → true); we flip that default off so a
        // plain table shows no resize handles until the consumer asks for them
        // with enableColumnResizing. Everything downstream (the handle in
        // HeaderCell, the fixed layout in Root) keys off getCanResize(), so this
        // single default gates the whole feature. Pair with columnResizeMode:
        // 'onChange' for live resizing (default 'onEnd' commits on release).
        enableColumnResizing: options.enableColumnResizing ?? false,
        // Every cell renders through <Cell> (the <td>) so column defs control
        // cell styling via props. Plain accessor columns don't write a cell
        // renderer, so wrap their value here; a column's own cell (or the
        // consumer's defaultColumn.cell) overrides this.
        defaultColumn: {
            cell: ({ getValue }) => (
                <Cell>{getValue() as React.ReactNode}</Cell>
            ),
            ...options.defaultColumn,
        },
        ...(manageExpansion
            ? { state: { ...options.state, expanded }, onExpandedChange }
            : {}),
    });
}
