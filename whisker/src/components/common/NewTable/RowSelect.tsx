import type { DisplayColumnDef, Row, Table } from '@tanstack/react-table';
import { Checkbox, type CheckboxProps } from '@chakra-ui/react';

import ActionCell from './ActionCell';
import ActionHeaderCell from './ActionHeaderCell';

type RowCheckboxProps<TData> = Omit<
    CheckboxProps,
    'isChecked' | 'isIndeterminate' | 'onChange'
> & {
    row: Row<TData>;
    'aria-label'?: string;
};

// Checkbox for a single row. Renders nothing for rows that can't be selected,
// so it's safe to drop into every row. Selecting a row must not also count as
// clicking it (see getSelectColumn / Row), but Chakra's Checkbox overrides a
// root onClick with its own, so stopping propagation here would be silently
// dropped — the select column stops it at the surrounding cell instead.
function RowCheckbox<TData>({
    row,
    'aria-label': ariaLabel = 'Select row',
    ...props
}: RowCheckboxProps<TData>) {
    if (!row.getCanSelect()) {
        return null;
    }

    return (
        <Checkbox
            data-slot='table-row-select'
            data-testid='row-select'
            aria-label={ariaLabel}
            isChecked={row.getIsSelected()}
            isDisabled={!row.getCanSelect()}
            onChange={row.getToggleSelectedHandler()}
            {...props}
        />
    );
}

type SelectAllCheckboxProps<TData> = Omit<
    CheckboxProps,
    'isChecked' | 'isIndeterminate' | 'onChange'
> & {
    table: Table<TData>;
    'aria-label'?: string;
};

// Header checkbox that toggles every selectable row, showing an indeterminate
// state when only some rows are selected.
function SelectAllCheckbox<TData>({
    table,
    'aria-label': ariaLabel = 'Select all rows',
    ...props
}: SelectAllCheckboxProps<TData>) {
    return (
        <Checkbox
            data-slot='table-select-all'
            data-testid='select-all'
            aria-label={ariaLabel}
            isChecked={table.getIsAllRowsSelected()}
            isIndeterminate={table.getIsSomeRowsSelected()}
            onChange={table.getToggleAllRowsSelectedHandler()}
            {...props}
        />
    );
}

export const SELECT_COLUMN_ID = 'select';

// Column-def factory for the row-selection column. Selection is expressed as a
// column the consumer prepends to its columns rather than a table prop, so
// Row/Header/Body stay feature-agnostic. Row selection is enabled by default in
// TanStack Table; pass enableRowSelection to useDataTable to gate it per-row.
export function getSelectColumn<TData>(
    overrides: Partial<DisplayColumnDef<TData, unknown>> = {},
): DisplayColumnDef<TData, unknown> {
    return {
        id: SELECT_COLUMN_ID,
        header: ({ table }) => (
            <ActionHeaderCell>
                <SelectAllCheckbox table={table} />
            </ActionHeaderCell>
        ),
        cell: ({ row }) => (
            // Stop clicks on the checkbox cell from bubbling to the row: when
            // the row is interactive (onRowClick / expansion), selecting a row
            // must not also activate it. Done at the cell because Chakra's
            // Checkbox swallows a root onClick (see RowCheckbox).
            <ActionCell onClick={(e) => e.stopPropagation()}>
                <RowCheckbox row={row} />
            </ActionCell>
        ),
        size: 40,
        enableSorting: false,
        enableResizing: false,
        ...overrides,
    };
}

export default RowCheckbox;
