import type { DisplayColumnDef, Row } from '@tanstack/react-table';
import { Flex, type FlexProps } from '@chakra-ui/react';
import { ChevronRightIcon, ChevronDownIcon } from '@chakra-ui/icons';

import Cell from './Cell';
import HeaderCell from './HeaderCell';

type ExpanderProps<TData> = FlexProps & {
    row: Row<TData>;
};

// Chevron that shows a row's expanded state. Renders nothing for rows that
// can't expand, so it's safe to drop into every row. It's a decorative
// indicator, not a control: an expandable row is itself the interactive
// element (see Row), so the chevron is aria-hidden and carries no click handler
// — a click on it falls through to the row, which toggles expansion. This keeps
// one focusable control and one expanded/collapsed announcement per row instead
// of the chevron duplicating both. Mirrors the old DataTable ExpandoCell (ghost
// chevron over a clickable row) rather than being a standalone button.
function Expander<TData>({ row, ...props }: ExpanderProps<TData>) {
    if (!row.getCanExpand()) {
        return null;
    }

    const isExpanded = row.getIsExpanded();

    return (
        <Flex
            data-slot='table-expander'
            data-testid='row-expander'
            aria-hidden
            align='center'
            justify='center'
            {...props}
        >
            {isExpanded ? (
                <ChevronDownIcon w={5} h={5} />
            ) : (
                <ChevronRightIcon w={5} h={5} />
            )}
        </Flex>
    );
}

export const EXPANDER_COLUMN_ID = 'expander';

// Column-def factory for the expander column. Expansion is expressed as a
// column the consumer prepends to its columns rather than a table prop, so
// Row/Header/Body stay feature-agnostic. Requires the table to set
// getRowCanExpand (e.g. `() => true`) and getExpandedRowModel; pair with
// <DataTable.Root renderSubComponent={...}> to render the detail panel. With an
// expander column present, the whole row is click/keyboard toggleable (see
// Row); the chevron just indicates state.
export function getExpanderColumn<TData>(
    overrides: Partial<DisplayColumnDef<TData, unknown>> = {},
): DisplayColumnDef<TData, unknown> {
    return {
        id: EXPANDER_COLUMN_ID,
        // Empty header cell; width:1% collapses the column to just the chevron
        // rather than letting it claim a share of the table width.
        header: () => <HeaderCell width='1%' />,
        cell: ({ row }) => (
            <Cell width='1%'>
                <Expander row={row} />
            </Cell>
        ),
        size: 40,
        enableSorting: false,
        enableResizing: false,
        ...overrides,
    };
}

export default Expander;
