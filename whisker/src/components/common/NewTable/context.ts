import * as React from 'react';
import type { Row, Table } from '@tanstack/react-table';

export type DataTableContextValue<TData> = {
    table: Table<TData>;
    // Renders the expanded detail panel for a row. Set once on Root so Row can
    // read it from context; it never has to be threaded through Body.
    renderSubComponent?: (row: Row<TData>) => React.ReactNode;
    // Fired when an interactive row is activated by pointer or keyboard
    // (Enter/Space). Set on Root — like renderSubComponent — so Row reads it
    // from context instead of Body/VirtualBody having to forward it. A row is
    // interactive when this is set or the row can expand; clicking anywhere on
    // such a row (or activating it from the keyboard) toggles expansion and
    // fires this. See Row.
    onRowClick?: (
        row: Row<TData>,
        event: React.MouseEvent | React.KeyboardEvent,
    ) => void;
    // The scroll container Root wraps the table in — the virtualizer's scroll
    // element for VirtualBody. Held as state (not a ref) and set via a callback
    // ref, because React attaches a parent's host ref only after its children's
    // layout effects run; a plain ref would still be null when VirtualBody's
    // virtualizer first looks for it. It lives on Root because it must be an
    // ancestor of the <table>, which Body/VirtualBody cannot reach otherwise.
    scrollElement: HTMLDivElement | null;
    // Pin the header cells to the top of the scroll container so they stay
    // visible while the body scrolls under them. Lives here (set on Root, which
    // owns the scroll container) so every HeaderCell — including the ones a
    // custom header renderer composes — reads the same flag from context rather
    // than having it drilled through Header. Only has a visible effect once the
    // container actually scrolls (a bounded height, e.g. with VirtualBody).
    stickyHeader: boolean;
};

export const DataTableContext =
    React.createContext<DataTableContextValue<unknown> | null>(null);

export function useDataTableContext<TData>(): DataTableContextValue<TData> {
    const context = React.useContext(DataTableContext);

    if (!context) {
        throw new Error(
            'DataTable components must be rendered within <DataTable.Root>',
        );
    }

    return context as DataTableContextValue<TData>;
}
