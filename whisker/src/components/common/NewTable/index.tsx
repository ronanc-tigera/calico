import ActionCell from './ActionCell';
import ActionHeaderCell from './ActionHeaderCell';
import ActionMenu from './ActionMenu';
import Body from './Body';
import Cell from './Cell';
import Empty from './Empty';
import Expander from './Expander';
import Header from './Header';
import HeaderCell from './HeaderCell';
import Root from './Root';
import Row from './Row';
import RowSelect from './RowSelect';
import VirtualBody from './VirtualBody';

export { useDataTable, type UseDataTableOptions } from './useDataTable';
export { useDataTableContext } from './context';
export { getExpanderColumn, EXPANDER_COLUMN_ID } from './Expander';
export { getSelectColumn, SELECT_COLUMN_ID } from './RowSelect';

// Compound table component over TanStack Table v8. The consumer owns the
// table instance (via useDataTable) and composes only the parts it needs;
// the parts share the instance through context, so no prop drilling. Empty
// self-gates on the row count, so it only renders when there are no rows:
//
//   const table = useDataTable({ data, columns });
//
//   <DataTable.Root table={table}>
//       <DataTable.Header />
//       <DataTable.Body />
//       <DataTable.Empty>No flows</DataTable.Empty>
//   </DataTable.Root>
//
// Each cell is a <DataTable.Cell> (the <td>) and each header a
// <DataTable.HeaderCell> (the <th>). Plain accessor columns get both
// automatically; a column with a custom `cell`/`header` renderer returns its
// own so it can set cell styling (width, padding, alignment) with props right
// in the column def:
//
//   columnHelper.display({
//       id: 'actions',
//       header: () => <DataTable.HeaderCell width='1%'>Actions</DataTable.HeaderCell>,
//       cell: () => <DataTable.Cell width='1%'><RowActions /></DataTable.Cell>,
//   })
//
// ActionMenu is its own composable compound (Root/Button/List/Item) for
// per-row action menus rendered inside a cell.
//
// Expandable rows are opt-in and expressed as a column, not a table prop.
// Give the table getExpandedRowModel + getRowCanExpand, prepend
// getExpanderColumn() to your columns, and set renderSubComponent on Root (so
// it reaches Row via context rather than being drilled through Body):
//
//   const table = useDataTable({
//       data, columns: [getExpanderColumn(), ...columns],
//       getRowCanExpand: () => true,
//       getExpandedRowModel: getExpandedRowModel(),
//   });
//
//   <DataTable.Root table={table} renderSubComponent={(row) => <Detail row={row.original} />}>
//       <DataTable.Header />
//       <DataTable.Body />
//   </DataTable.Root>
//
// Expanding a row collapses any other by default; pass
// enableMultiRowExpansion to useDataTable to allow several open at once.
//
// An expandable row is toggleable across its whole width, not just the chevron:
// clicking anywhere on it — or focusing it and pressing Enter/Space — toggles
// expansion. The chevron is a state indicator, not a separate control. Controls
// living inside a row (checkbox, action menu) stop click propagation, so using
// them doesn't also toggle the row.
//
// To react to row activation yourself (e.g. select a row, open a drawer), pass
// onRowClick to Root. It fires on click and on keyboard activation, receiving
// the row and the event, and — like renderSubComponent — reaches Row via
// context, so Body/VirtualBody don't forward it. Providing it also makes every
// row interactive, so it works with or without an expander column:
//
//   <DataTable.Root table={table} onRowClick={(row) => select(row.original)}>
//       <DataTable.Header />
//       <DataTable.Body />
//   </DataTable.Root>
//
// Row selection follows the same column-as-feature shape: prepend
// getSelectColumn() to your columns for a checkbox column (header toggles all,
// cells toggle their row). Selection is enabled by default; pass
// enableRowSelection to useDataTable to gate it, and read table.getSelectedRowModel()
// for the current selection:
//
//   const table = useDataTable({ data, columns: [getSelectColumn(), ...columns] });
//   table.getSelectedRowModel().rows // currently checked rows
//
// Sorting is opt-in via the sorted row model, like TanStack itself: give the
// table getSortedRowModel and accessor columns become sortable — Header turns
// their header into a toggle with a sort indicator, cycling asc → desc →
// unsorted. Disable it per column with enableSorting: false (or table-wide via
// the enableSorting option):
//
//   const table = useDataTable({
//       data, columns,
//       getSortedRowModel: getSortedRowModel(),
//   });
//
// Plain accessor headers get the toggle for free. A column with a custom header
// renderer opts in by passing DataTable.HeaderCell the header from its context:
//
//   header: ({ header }) => (
//       <DataTable.HeaderCell header={header}>Source</DataTable.HeaderCell>
//   )
//
// For large data sets, swap Body for VirtualBody to render only the rows in
// view. Give Root's scroll container a bounded height so there is something to
// virtualize within:
//
//   <DataTable.Root table={table} containerProps={{ maxH: 400 }}>
//       <DataTable.Header />
//       <DataTable.VirtualBody />
//   </DataTable.Root>
//
// The header is sticky by default: once the scroll container has a bounded
// height and the body scrolls, the header cells pin to the top and stay in
// view. Turn it off with stickyHeader={false} on Root for a header that scrolls
// away with the body.
//
// Both bodies render every row themselves by default, but the row loop can be
// owned by the consumer to attach per-row props (styling, animation classes) —
// element children for Body, a per-visible-row render prop for VirtualBody
// (the virtualizer owns which rows exist):
//
//   <DataTable.Body>
//       {table.getRowModel().rows.map((row) => (
//           <DataTable.Row key={row.id} row={row} className={...} />
//       ))}
//   </DataTable.Body>
//
//   <DataTable.VirtualBody>
//       {(row) => <DataTable.Row row={row} className={...} />}
//   </DataTable.VirtualBody>
//
// Column resizing is opt-in via enableColumnResizing (off by default), following
// TanStack's column-sizing guide. Turn it on and every accessor column grows a
// drag handle on its trailing edge; Root switches to a fixed layout so columns
// resize crisply. Opt a column out with enableResizing: false, and set per-
// column size / minSize / maxSize to bound it. Double-click a handle to reset.
//
//   const table = useDataTable({
//       data, columns,
//       enableColumnResizing: true,
//       columnResizeMode: 'onChange', // live; default 'onEnd' commits on release
//   });
//
// Widths are driven by a <colgroup> and the body is frozen mid-drag, so live
// (onChange) resizing stays smooth even on large or virtualized tables. The
// table fills its container: every column but the last holds its width and the
// last flexes to take up the remaining space (scrolling once the columns
// outgrow the container). Read the widths back from
// table.getState().columnSizing (or drive them yourself with
// state.columnSizing + onColumnSizingChange, like sorting).
const DataTable = {
    Root,
    Header,
    HeaderCell,
    Body,
    VirtualBody,
    Row,
    RowSelect,
    Cell,
    ActionCell,
    ActionHeaderCell,
    Empty,
    Expander,
    ActionMenu,
};

export default DataTable;
