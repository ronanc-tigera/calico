import { Td as ChakraTd, type TableCellProps } from '@chakra-ui/react';

// The table's <td>. A column's `cell` renderer returns one of these, so styling
// (width, padding, alignment) is set with props right where the cell is
// defined. Plain accessor columns get one for free via useDataTable's
// defaultColumn; columns with a custom cell compose it themselves:
//
//   cell: ({ row }) => <Cell width='1%'><RowCheckbox row={row} /></Cell>
function Cell(props: TableCellProps) {
    return (
        <ChakraTd data-slot='table-cell' data-testid='cell-body' {...props} />
    );
}

export default Cell;
