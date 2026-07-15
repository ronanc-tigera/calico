import { render, screen, fireEvent } from '@testing-library/react';
import {
    createColumnHelper,
    getExpandedRowModel,
    getSortedRowModel,
    type Row,
} from '@tanstack/react-table';

import DataTable, {
    getExpanderColumn,
    getSelectColumn,
    useDataTable,
} from '../index';

type Person = {
    name: string;
    role: string;
};

const columnHelper = createColumnHelper<Person>();

const columns = [
    columnHelper.accessor('name', { header: 'Name' }),
    columnHelper.accessor('role', { header: 'Role', size: 100 }),
];

const people: Person[] = [
    { name: 'Ada', role: 'Engineer' },
    { name: 'Grace', role: 'Admiral' },
];

const TestTable = ({
    data,
    emptyState,
    sticky,
}: {
    data: Person[];
    emptyState?: React.ReactNode;
    sticky?: boolean;
}) => {
    const table = useDataTable({ data, columns });

    return (
        <DataTable.Root table={table} stickyHeader={sticky}>
            <DataTable.Header />
            <DataTable.Body />
            <DataTable.Empty>{emptyState}</DataTable.Empty>
        </DataTable.Root>
    );
};

describe('NewTable', () => {
    it('renders column headers and row cells', () => {
        render(<TestTable data={people} />);

        expect(screen.getByText('Name')).toBeInTheDocument();
        expect(screen.getByText('Role')).toBeInTheDocument();
        expect(screen.getByText('Ada')).toBeInTheDocument();
        expect(screen.getByText('Admiral')).toBeInTheDocument();
        expect(screen.getAllByTestId('cell-body')).toHaveLength(4);
    });

    it('applies column sizes to the headers', () => {
        render(<TestTable data={people} />);

        const [name, role] = screen.getAllByTestId('column-header');

        expect(name).toHaveStyle({ width: '150px' }); // TanStack default size
        expect(role).toHaveStyle({ width: '100px' });
    });

    it('renders the default empty state when there are no rows', () => {
        render(<TestTable data={[]} />);

        expect(screen.getByText('No results')).toBeInTheDocument();
    });

    it('renders a custom empty state when provided', () => {
        render(<TestTable data={[]} emptyState={<>Nothing here</>} />);

        expect(screen.getByText('Nothing here')).toBeInTheDocument();
        expect(screen.queryByText('No results')).not.toBeInTheDocument();
    });

    it('does not render the empty state when there are rows', () => {
        render(<TestTable data={people} emptyState={<>Nothing here</>} />);

        expect(screen.queryByText('Nothing here')).not.toBeInTheDocument();
        expect(screen.queryByText('No results')).not.toBeInTheDocument();
    });

    it('renders consumer-provided rows when Body is given children', () => {
        const ComposedTable = () => {
            const table = useDataTable({ data: people, columns });

            return (
                <DataTable.Root table={table}>
                    <DataTable.Header />
                    <DataTable.Body>
                        {table.getRowModel().rows.map((row) => (
                            <DataTable.Row
                                key={row.id}
                                row={row}
                                className='consumer-row'
                            />
                        ))}
                    </DataTable.Body>
                </DataTable.Root>
            );
        };

        render(<ComposedTable />);

        // The consumer's loop renders the rows (with its per-row props), and
        // Body doesn't render its default loop on top.
        expect(document.querySelectorAll('tr.consumer-row')).toHaveLength(
            people.length,
        );
        expect(screen.getByText('Ada')).toBeInTheDocument();
        expect(
            document.querySelectorAll('[data-slot="table-row"]'),
        ).toHaveLength(people.length);
    });

    describe('sticky header', () => {
        it('pins the header cells to the top by default', () => {
            render(<TestTable data={people} />);

            for (const header of screen.getAllByTestId('column-header')) {
                expect(header).toHaveStyle({ position: 'sticky', top: '0' });
            }
        });

        it('does not pin the header when sticky is disabled', () => {
            render(<TestTable data={people} sticky={false} />);

            for (const header of screen.getAllByTestId('column-header')) {
                expect(header).not.toHaveStyle({ position: 'sticky' });
            }
        });
    });

    it('does not render an expander column or detail panel by default', () => {
        render(<TestTable data={people} />);

        expect(screen.queryByTestId('row-expander')).not.toBeInTheDocument();
    });

    describe('expandable rows', () => {
        const ExpandableTable = ({
            enableMultiRowExpansion = false,
            onRowClick,
        }: {
            enableMultiRowExpansion?: boolean;
            onRowClick?: (row: Row<Person>) => void;
        } = {}) => {
            const table = useDataTable({
                data: people,
                columns: [getExpanderColumn<Person>(), ...columns],
                getRowCanExpand: () => true,
                getExpandedRowModel: getExpandedRowModel(),
                enableMultiRowExpansion,
            });

            return (
                <DataTable.Root
                    table={table}
                    onRowClick={onRowClick}
                    renderSubComponent={(row) => (
                        <div>Detail for {row.original.name}</div>
                    )}
                >
                    <DataTable.Header />
                    <DataTable.Body />
                </DataTable.Root>
            );
        };

        // The row that renders `name`, i.e. the clickable/focusable <tr>.
        const rowFor = (name: string) =>
            screen.getByText(name).closest('tr') as HTMLTableRowElement;

        it('renders an expander toggle per row', () => {
            render(<ExpandableTable />);

            expect(screen.getAllByTestId('row-expander')).toHaveLength(
                people.length,
            );
        });

        it('renders the detail panel only for the expanded row on toggle', () => {
            render(<ExpandableTable />);

            expect(
                screen.queryByText('Detail for Ada'),
            ).not.toBeInTheDocument();

            fireEvent.click(screen.getAllByTestId('row-expander')[0]);

            expect(screen.getByText('Detail for Ada')).toBeInTheDocument();
            expect(
                screen.queryByText('Detail for Grace'),
            ).not.toBeInTheDocument();
        });

        it('collapses the detail panel when toggled again', () => {
            render(<ExpandableTable />);

            // Re-query each time: toggling swaps the icon/aria-expanded, so the
            // button node from the previous render is stale.
            fireEvent.click(screen.getAllByTestId('row-expander')[0]);
            expect(screen.getByText('Detail for Ada')).toBeInTheDocument();

            fireEvent.click(screen.getAllByTestId('row-expander')[0]);
            expect(
                screen.queryByText('Detail for Ada'),
            ).not.toBeInTheDocument();
        });

        it('collapses the previously expanded row by default (single-row)', () => {
            render(<ExpandableTable />);

            fireEvent.click(screen.getAllByTestId('row-expander')[0]);
            expect(screen.getByText('Detail for Ada')).toBeInTheDocument();

            // Expanding a second row collapses the first.
            fireEvent.click(screen.getAllByTestId('row-expander')[1]);
            expect(screen.getByText('Detail for Grace')).toBeInTheDocument();
            expect(
                screen.queryByText('Detail for Ada'),
            ).not.toBeInTheDocument();
        });

        it('keeps rows open together when enableMultiRowExpansion is set', () => {
            render(<ExpandableTable enableMultiRowExpansion />);

            fireEvent.click(screen.getAllByTestId('row-expander')[0]);
            fireEvent.click(screen.getAllByTestId('row-expander')[1]);

            expect(screen.getByText('Detail for Ada')).toBeInTheDocument();
            expect(screen.getByText('Detail for Grace')).toBeInTheDocument();
        });

        it('toggles expansion when the row is clicked, not just the chevron', () => {
            render(<ExpandableTable />);

            // Click a data cell rather than the expander chevron.
            fireEvent.click(screen.getByText('Ada'));
            expect(screen.getByText('Detail for Ada')).toBeInTheDocument();

            fireEvent.click(screen.getByText('Ada'));
            expect(
                screen.queryByText('Detail for Ada'),
            ).not.toBeInTheDocument();
        });

        it('exposes the row as a focusable control with aria-expanded', () => {
            render(<ExpandableTable />);

            const row = rowFor('Ada');
            expect(row).toHaveAttribute('tabindex', '0');
            expect(row).toHaveAttribute('aria-expanded', 'false');

            fireEvent.click(row);
            expect(row).toHaveAttribute('aria-expanded', 'true');
        });

        it('toggles expansion on Enter and Space when the row is focused', () => {
            render(<ExpandableTable />);

            fireEvent.keyDown(rowFor('Ada'), { key: 'Enter' });
            expect(screen.getByText('Detail for Ada')).toBeInTheDocument();

            fireEvent.keyDown(rowFor('Ada'), { key: ' ' });
            expect(
                screen.queryByText('Detail for Ada'),
            ).not.toBeInTheDocument();
        });

        it('does not toggle when a key is pressed on an inner element', () => {
            render(<ExpandableTable />);

            // The key event targets the cell, not the row itself, so the row's
            // handler must ignore it (an inner control would own the key).
            fireEvent.keyDown(screen.getByText('Ada'), { key: 'Enter' });

            expect(
                screen.queryByText('Detail for Ada'),
            ).not.toBeInTheDocument();
        });

        it('toggles expansion and fires onRowClick together', () => {
            const onRowClick = jest.fn();
            render(<ExpandableTable onRowClick={onRowClick} />);

            fireEvent.click(screen.getByText('Ada'));

            expect(screen.getByText('Detail for Ada')).toBeInTheDocument();
            expect(onRowClick).toHaveBeenCalledTimes(1);
            expect(onRowClick.mock.calls[0][0].original).toEqual(people[0]);
        });
    });

    describe('row click', () => {
        const ClickableTable = ({
            onRowClick,
            withSelectColumn = false,
        }: {
            onRowClick: (row: Row<Person>) => void;
            withSelectColumn?: boolean;
        }) => {
            const table = useDataTable({
                data: people,
                columns: withSelectColumn
                    ? [getSelectColumn<Person>(), ...columns]
                    : columns,
            });

            return (
                <DataTable.Root table={table} onRowClick={onRowClick}>
                    <DataTable.Header />
                    <DataTable.Body />
                </DataTable.Root>
            );
        };

        const rowFor = (name: string) =>
            screen.getByText(name).closest('tr') as HTMLTableRowElement;

        it('fires onRowClick with the clicked row, no expander needed', () => {
            const onRowClick = jest.fn();
            render(<ClickableTable onRowClick={onRowClick} />);

            const row = rowFor('Ada');
            expect(row).toHaveAttribute('tabindex', '0');
            // A click-only row is not an expand control, so no aria-expanded.
            expect(row).not.toHaveAttribute('aria-expanded');

            fireEvent.click(screen.getByText('Ada'));

            expect(onRowClick).toHaveBeenCalledTimes(1);
            expect(onRowClick.mock.calls[0][0].original).toEqual(people[0]);
        });

        it('fires onRowClick on Enter and Space when a row is focused', () => {
            const onRowClick = jest.fn();
            render(<ClickableTable onRowClick={onRowClick} />);

            fireEvent.keyDown(rowFor('Ada'), { key: 'Enter' });
            fireEvent.keyDown(rowFor('Grace'), { key: ' ' });

            expect(onRowClick).toHaveBeenCalledTimes(2);
            expect(onRowClick.mock.calls[0][0].original).toEqual(people[0]);
            expect(onRowClick.mock.calls[1][0].original).toEqual(people[1]);
        });

        it('does not fire onRowClick when an in-row control is operated', () => {
            const onRowClick = jest.fn();
            render(<ClickableTable onRowClick={onRowClick} withSelectColumn />);

            // The checkbox stops propagation, so selecting is not a row click.
            fireEvent.click(screen.getAllByTestId('row-select')[0]);
            expect(onRowClick).not.toHaveBeenCalled();

            // A click elsewhere on the row still counts.
            fireEvent.click(screen.getByText('Ada'));
            expect(onRowClick).toHaveBeenCalledTimes(1);
        });

        it('leaves rows non-interactive without onRowClick or expansion', () => {
            render(<TestTable data={people} />);

            const row = screen.getByText('Ada').closest('tr');
            expect(row).not.toHaveAttribute('tabindex');
            expect(row).not.toHaveAttribute('aria-expanded');
        });
    });

    describe('row selection', () => {
        const SelectableTable = () => {
            const table = useDataTable({
                data: people,
                columns: [getSelectColumn<Person>(), ...columns],
            });

            return (
                <DataTable.Root table={table}>
                    <DataTable.Header />
                    <DataTable.Body />
                    <caption data-testid='selected-count'>
                        {table.getSelectedRowModel().rows.length}
                    </caption>
                </DataTable.Root>
            );
        };

        const selectedCount = () =>
            Number(screen.getByTestId('selected-count').textContent);

        it('does not render a select column by default', () => {
            render(<TestTable data={people} />);

            expect(screen.queryByTestId('select-all')).not.toBeInTheDocument();
            expect(screen.queryByTestId('row-select')).not.toBeInTheDocument();
        });

        it('renders a select checkbox per row plus a select-all in the header', () => {
            render(<SelectableTable />);

            expect(screen.getAllByTestId('row-select')).toHaveLength(
                people.length,
            );
            expect(screen.getByTestId('select-all')).toBeInTheDocument();
        });

        it('toggles a single row on and off', () => {
            render(<SelectableTable />);

            expect(selectedCount()).toBe(0);

            fireEvent.click(screen.getAllByTestId('row-select')[0]);
            expect(selectedCount()).toBe(1);

            fireEvent.click(screen.getAllByTestId('row-select')[0]);
            expect(selectedCount()).toBe(0);
        });

        it('selects and clears every row via the header checkbox', () => {
            render(<SelectableTable />);

            fireEvent.click(screen.getByTestId('select-all'));
            expect(selectedCount()).toBe(people.length);

            fireEvent.click(screen.getByTestId('select-all'));
            expect(selectedCount()).toBe(0);
        });

        it('marks the row selected for styling when checked', () => {
            render(<SelectableTable />);

            fireEvent.click(screen.getAllByTestId('row-select')[0]);

            const selectedRows = document.querySelectorAll(
                '[data-slot="table-row"][data-state="selected"]',
            );
            expect(selectedRows).toHaveLength(1);
        });
    });

    describe('sorting', () => {
        const SortableTable = ({
            columns: cols = columns,
        }: {
            columns?: typeof columns;
        } = {}) => {
            const table = useDataTable({
                data: people,
                columns: cols,
                getSortedRowModel: getSortedRowModel(),
            });

            return (
                <DataTable.Root table={table}>
                    <DataTable.Header />
                    <DataTable.Body />
                </DataTable.Root>
            );
        };

        // The first body cell of each row is that row's name, so reading the
        // name cells top-to-bottom gives the current row order.
        const nameOrder = () =>
            screen
                .getAllByTestId('cell-body')
                .filter((_, i) => i % columns.length === 0)
                .map((cell) => cell.textContent);

        it('does not render sort controls without a sorted row model', () => {
            render(<TestTable data={people} />);

            expect(
                screen.queryByRole('button', { name: 'Name' }),
            ).not.toBeInTheDocument();
            expect(
                screen.queryByTestId('column-sorter'),
            ).not.toBeInTheDocument();
        });

        it('renders a sort toggle per sortable column when sorting is wired', () => {
            render(<SortableTable />);

            expect(
                screen.getByRole('button', { name: 'Name' }),
            ).toBeInTheDocument();
            expect(
                screen.getByRole('button', { name: 'Role' }),
            ).toBeInTheDocument();
        });

        it('cycles asc → desc and reflects it in aria-sort', () => {
            render(<SortableTable />);

            const button = screen.getByRole('button', { name: 'Name' });
            const header = button.closest('th');

            expect(header).toHaveAttribute('aria-sort', 'none');

            fireEvent.click(button);
            expect(header).toHaveAttribute('aria-sort', 'ascending');
            expect(nameOrder()).toEqual(['Ada', 'Grace']);

            fireEvent.click(button);
            expect(header).toHaveAttribute('aria-sort', 'descending');
            expect(nameOrder()).toEqual(['Grace', 'Ada']);
        });

        it('reorders rows by the clicked column', () => {
            render(<SortableTable />);

            // Sort by role ascending: Admiral (Grace) before Engineer (Ada).
            fireEvent.click(screen.getByRole('button', { name: 'Role' }));

            expect(nameOrder()).toEqual(['Grace', 'Ada']);
        });

        it('does not make a column with sorting disabled interactive', () => {
            render(
                <SortableTable
                    columns={[
                        columnHelper.accessor('name', { header: 'Name' }),
                        columnHelper.accessor('role', {
                            header: 'Role',
                            enableSorting: false,
                        }),
                    ]}
                />,
            );

            expect(
                screen.getByRole('button', { name: 'Name' }),
            ).toBeInTheDocument();
            expect(
                screen.queryByRole('button', { name: 'Role' }),
            ).not.toBeInTheDocument();
            // The header text is still there, just not a toggle.
            expect(screen.getByText('Role')).toBeInTheDocument();
        });
    });

    describe('virtualized rows', () => {
        const CONTAINER_HEIGHT = 400;
        const ROW_HEIGHT = 35;
        const manyPeople: Person[] = Array.from({ length: 200 }, (_, i) => ({
            name: `Person ${i}`,
            role: `Role ${i}`,
        }));

        const rowCount = () =>
            document.querySelectorAll('[data-slot="table-row"]').length;

        // jsdom has no layout engine or ResizeObserver, so give the virtualizer
        // real numbers. It sizes the scroll element from offsetHeight and
        // measures rows from getBoundingClientRect — both mocked here, keyed off
        // data-slot so the container reports 400px and each row 35px.
        const heightFor = (el: Element) =>
            el.getAttribute('data-slot') === 'table-container'
                ? CONTAINER_HEIGHT
                : ROW_HEIGHT;

        let originalRect: typeof HTMLElement.prototype.getBoundingClientRect;
        let originalOffsetHeight: PropertyDescriptor | undefined;

        beforeAll(() => {
            class MockResizeObserver {
                observe() {}
                unobserve() {}
                disconnect() {}
            }
            // Set on window too: the virtualizer reads ResizeObserver off the
            // scroll element's ownerDocument.defaultView, which is window.
            (global as unknown as { ResizeObserver: unknown }).ResizeObserver =
                MockResizeObserver;
            (window as unknown as { ResizeObserver: unknown }).ResizeObserver =
                MockResizeObserver;

            originalRect = HTMLElement.prototype.getBoundingClientRect;
            HTMLElement.prototype.getBoundingClientRect = function () {
                const height = heightFor(this);
                return {
                    width: 500,
                    height,
                    top: 0,
                    left: 0,
                    right: 500,
                    bottom: height,
                    x: 0,
                    y: 0,
                    toJSON: () => {},
                } as DOMRect;
            };

            originalOffsetHeight = Object.getOwnPropertyDescriptor(
                HTMLElement.prototype,
                'offsetHeight',
            );
            Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
                configurable: true,
                get() {
                    return heightFor(this);
                },
            });
        });

        afterAll(() => {
            HTMLElement.prototype.getBoundingClientRect = originalRect;
            if (originalOffsetHeight) {
                Object.defineProperty(
                    HTMLElement.prototype,
                    'offsetHeight',
                    originalOffsetHeight,
                );
            }
        });

        const VirtualTable = () => {
            const table = useDataTable({ data: manyPeople, columns });

            return (
                <DataTable.Root
                    table={table}
                    containerProps={{ maxH: CONTAINER_HEIGHT }}
                >
                    <DataTable.Header />
                    <DataTable.VirtualBody overscan={2} />
                </DataTable.Root>
            );
        };

        it('renders only the rows in view, not the whole data set', () => {
            render(<VirtualTable />);

            const rendered = rowCount();

            // A ~400px window over 35px rows is well under 200 rows, but more
            // than zero.
            expect(rendered).toBeGreaterThan(0);
            expect(rendered).toBeLessThan(manyPeople.length);
        });

        it('pads the scroll height with a spacer row', () => {
            render(<VirtualTable />);

            expect(
                document.querySelector('[data-slot="table-virtual-spacer"]'),
            ).toBeInTheDocument();
        });

        it('renders content for the first row', () => {
            render(<VirtualTable />);

            expect(screen.getByText('Person 0')).toBeInTheDocument();
        });

        it('renders consumer rows via the children render prop, still windowed', () => {
            const ComposedVirtualTable = () => {
                const table = useDataTable({ data: manyPeople, columns });

                return (
                    <DataTable.Root
                        table={table}
                        containerProps={{ maxH: CONTAINER_HEIGHT }}
                    >
                        <DataTable.Header />
                        <DataTable.VirtualBody overscan={2}>
                            {(row) => (
                                <DataTable.Row
                                    row={row}
                                    className='consumer-row'
                                />
                            )}
                        </DataTable.VirtualBody>
                    </DataTable.Root>
                );
            };

            render(<ComposedVirtualTable />);

            const consumerRows =
                document.querySelectorAll('tr.consumer-row').length;

            // The consumer's element renders per visible row — windowed, not
            // the whole data set.
            expect(consumerRows).toBe(rowCount());
            expect(consumerRows).toBeGreaterThan(0);
            expect(consumerRows).toBeLessThan(manyPeople.length);
        });
    });

    describe('column resizing', () => {
        const ResizableTable = ({
            columns: cols = columns,
            columnResizeMode = 'onChange',
        }: {
            columns?: typeof columns;
            columnResizeMode?: 'onChange' | 'onEnd';
        } = {}) => {
            const table = useDataTable({
                data: people,
                columns: cols,
                enableColumnResizing: true,
                columnResizeMode,
            });

            return (
                <DataTable.Root table={table}>
                    <DataTable.Header />
                    <DataTable.Body />
                </DataTable.Root>
            );
        };

        // Mimic a pointer drag: the resize handler reads clientX on mousedown
        // and tracks mousemove/mouseup on the document (see getResizeHandler).
        const dragBy = (handle: Element, deltaX: number) => {
            fireEvent.mouseDown(handle, { clientX: 0 });
            fireEvent.mouseMove(document, { clientX: deltaX });
            fireEvent.mouseUp(document, { clientX: deltaX });
        };

        it('does not render resize handles by default', () => {
            render(<TestTable data={people} />);

            expect(
                screen.queryByTestId('column-resizer'),
            ).not.toBeInTheDocument();
            expect(document.querySelector('colgroup')).not.toBeInTheDocument();
        });

        it('renders a resize handle per column when enabled', () => {
            render(<ResizableTable />);

            expect(screen.getAllByTestId('column-resizer')).toHaveLength(
                columns.length,
            );
        });

        it('omits the handle for a column with resizing disabled', () => {
            render(
                <ResizableTable
                    columns={[
                        columnHelper.accessor('name', { header: 'Name' }),
                        columnHelper.accessor('role', {
                            header: 'Role',
                            enableResizing: false,
                        }),
                    ]}
                />,
            );

            expect(screen.getAllByTestId('column-resizer')).toHaveLength(1);
        });

        it('sizes columns via the colgroup and lets the last one fill', () => {
            render(<ResizableTable />);

            const cols = document.querySelectorAll('colgroup col');
            expect(cols).toHaveLength(columns.length);
            // Every column but the last is pinned to its width...
            expect(cols[0]).toHaveStyle({ width: '150px' }); // name (default)
            // ...the last flexes to fill the container, so it carries no width.
            expect(cols[cols.length - 1].getAttribute('style')).toBeNull();
        });

        it('widens a column as its handle is dragged', () => {
            render(<ResizableTable />);

            const [nameHandle] = screen.getAllByTestId('column-resizer');
            // +50px on the 150px name column → 200px.
            dragBy(nameHandle, 50);

            expect(document.querySelectorAll('colgroup col')[0]).toHaveStyle({
                width: '200px',
            });
        });

        it('resets a column to its default size on double-click', () => {
            render(<ResizableTable />);

            const [nameHandle] = screen.getAllByTestId('column-resizer');
            dragBy(nameHandle, 50);
            expect(document.querySelectorAll('colgroup col')[0]).toHaveStyle({
                width: '200px',
            });

            fireEvent.doubleClick(nameHandle);
            expect(document.querySelectorAll('colgroup col')[0]).toHaveStyle({
                width: '150px',
            });
        });
    });

    it('throws when a table part is rendered outside of DataTable.Root', () => {
        jest.spyOn(console, 'error').mockImplementation(() => undefined);

        expect(() =>
            render(
                <table>
                    <DataTable.Header />
                </table>,
            ),
        ).toThrow('DataTable components must be rendered within');

        jest.restoreAllMocks();
    });
});
