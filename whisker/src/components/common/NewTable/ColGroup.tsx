import { useDataTableContext } from './context';

// A <colgroup> that fixes each column's width from the table's sizing state.
// Root renders it (with table-layout: fixed) only while resizing is enabled.
//
// It exists to make live resizing performant per TanStack's column-sizing
// guide: the guide keeps the body from re-rendering on every drag frame, but
// widths must still update. Rather than write a width onto every <td> (our
// <Cell> is authored in the column def and doesn't know its column id), we set
// the widths once here on the <col> elements. They govern the whole column
// under table-layout: fixed, so the widths track the drag even while Body is
// frozen — the colgroup sits outside the memoized body and re-renders freely.
//
// The last column is left width-less so it absorbs the slack between the summed
// column widths and the container: the table fills its container instead of
// leaving a gap, and — because only this one column flexes — every other column
// keeps its exact width, so its resize handle stays under the cursor.
function ColGroup<TData>() {
    const { table } = useDataTableContext<TData>();
    const leafColumns = table.getVisibleLeafColumns();
    const lastIndex = leafColumns.length - 1;

    return (
        <colgroup>
            {leafColumns.map((column, index) => (
                <col
                    key={column.id}
                    style={
                        index === lastIndex
                            ? undefined
                            : { width: column.getSize() }
                    }
                />
            ))}
        </colgroup>
    );
}

export default ColGroup;
