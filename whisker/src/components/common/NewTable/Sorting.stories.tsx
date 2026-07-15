import * as React from 'react';
import type { Story, StoryDefault } from '@ladle/react';
import { getSortedRowModel, type SortingState } from '@tanstack/react-table';
import { Button, Code, Flex, Heading, Text } from '@chakra-ui/react';

import DataTable, { useDataTable } from './index';
import { columnHelper, data } from './stories.fixtures';

export default {
    title: 'Common / NewTable',
} satisfies StoryDefault;

// Source and Destination sort; Protocol and Action opt out with
// enableSorting: false, so they stay plain, non-interactive headers.
const columns = [
    columnHelper.accessor('source', { header: 'Source' }),
    columnHelper.accessor('destination', { header: 'Destination' }),
    columnHelper.accessor('protocol', {
        header: 'Protocol',
        size: 100,
        enableSorting: false,
    }),
    columnHelper.accessor('action', {
        header: 'Action',
        size: 100,
        enableSorting: false,
    }),
];

// Uncontrolled: give the table getSortedRowModel and it manages the sort state
// itself. Accessor columns become toggles cycling asc → desc → unsorted.
const UncontrolledSortingTable = () => {
    const table = useDataTable({
        data,
        columns,
        getSortedRowModel: getSortedRowModel(),
    });

    return (
        <DataTable.Root table={table}>
            <DataTable.Header />
            <DataTable.Body />
        </DataTable.Root>
    );
};

// Controlled: the parent owns the sort state (state.sorting + onSortingChange),
// so it can read it, persist it, or set it from elsewhere. getSortedRowModel
// still does the client-side reordering; only the state moves out.
const ControlledSortingTable = () => {
    const [sorting, setSorting] = React.useState<SortingState>([
        { id: 'source', desc: false },
    ]);

    const table = useDataTable({
        data,
        columns,
        state: { sorting },
        onSortingChange: setSorting,
        getSortedRowModel: getSortedRowModel(),
    });

    return (
        <Flex direction='column' gap={4} alignItems='flex-start'>
            <Flex gap={2}>
                <Button
                    size='sm'
                    onClick={() =>
                        setSorting([{ id: 'destination', desc: true }])
                    }
                >
                    Sort by destination
                </Button>
                <Button
                    size='sm'
                    variant='ghost'
                    onClick={() => setSorting([])}
                >
                    Clear sort
                </Button>
            </Flex>

            <DataTable.Root table={table}>
                <DataTable.Header />
                <DataTable.Body />
            </DataTable.Root>

            <Code>sorting = {JSON.stringify(sorting)}</Code>
        </Flex>
    );
};

const UNCONTROLLED_SNIPPET = `
const columns = [
    columnHelper.accessor('source', { header: 'Source' }),
    columnHelper.accessor('destination', { header: 'Destination' }),
    // Opt out: no sort toggle on these two.
    columnHelper.accessor('protocol', { header: 'Protocol', enableSorting: false }),
    columnHelper.accessor('action', { header: 'Action', enableSorting: false }),
];

const table = useDataTable({
    data,
    columns,
    getSortedRowModel: getSortedRowModel(),
});

<DataTable.Root table={table}>
    <DataTable.Header />
    <DataTable.Body />
</DataTable.Root>`;

const CONTROLLED_SNIPPET = `
const [sorting, setSorting] = React.useState<SortingState>([
    { id: 'source', desc: false },
]);

const table = useDataTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getSortedRowModel: getSortedRowModel(),
});`;

export const WithSorting: Story = () => (
    <Flex direction='column' gap={32}>
        <Flex direction='column' gap={4}>
            <Heading size='md'>Sorting</Heading>
            <Text>
                Give the table getSortedRowModel and accessor columns become
                sortable — their headers turn into toggles with a sort
                indicator. Opt a column out with enableSorting: false.
            </Text>

            <UncontrolledSortingTable />

            <pre>
                <code>{UNCONTROLLED_SNIPPET}</code>
            </pre>
        </Flex>

        <Flex direction='column' gap={4}>
            <Heading size='md'>Controlled sorting</Heading>
            <Text>
                Hand the table a sorting state you own to drive it from the
                parent. Header clicks flow through your onSortingChange, and you
                can set the sort from anywhere — here, from the buttons above.
            </Text>

            <ControlledSortingTable />

            <pre>
                <code>{CONTROLLED_SNIPPET}</code>
            </pre>
        </Flex>
    </Flex>
);
