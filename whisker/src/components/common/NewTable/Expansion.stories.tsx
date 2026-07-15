import * as React from 'react';
import type { Story, StoryDefault } from '@ladle/react';
import { getExpandedRowModel } from '@tanstack/react-table';
import { Box, Flex, Heading, Text } from '@chakra-ui/react';

import DataTable, { getExpanderColumn, useDataTable } from './index';
import { columns, data, type FlowLog } from './stories.fixtures';

export default {
    title: 'Common / NewTable',
} satisfies StoryDefault;

const ExpandableExample = ({
    enableMultiRowExpansion,
}: {
    enableMultiRowExpansion?: boolean;
}) => {
    const table = useDataTable({
        data,
        columns: [getExpanderColumn<FlowLog>(), ...columns],
        getRowCanExpand: () => true,
        getExpandedRowModel: getExpandedRowModel(),
        enableMultiRowExpansion,
    });

    return (
        <DataTable.Root
            table={table}
            renderSubComponent={(row) => (
                <Box p={4}>
                    <pre>
                        <code>{JSON.stringify(row.original, null, 2)}</code>
                    </pre>
                </Box>
            )}
        >
            <DataTable.Header />
            <DataTable.Body />
        </DataTable.Root>
    );
};

// Single-row expansion is the default: opening a row collapses any other. The
// whole row is toggleable — click anywhere on it, or focus it (Tab) and press
// Enter/Space; the chevron just indicates state. Opt into several rows being
// open at once via enableMultiRowExpansion.
export const WithExpandableRows: Story = () => (
    <Flex direction='column' gap={32}>
        <Flex direction='column' gap={4}>
            <Heading size='md'>Expandable rows</Heading>
            <Text>
                Give the table getExpandedRowModel and an expander column, and
                rows become toggleable — click anywhere on a row, or focus it
                (Tab) and press Enter/Space. The default is single-row
                expansion: opening a row collapses any other.
            </Text>

            <ExpandableExample />

            <pre>
                <code>{`
const table = useDataTable({
    data,
    columns: [getExpanderColumn(), ...columns],
    getRowCanExpand: () => true,
    getExpandedRowModel: getExpandedRowModel(),
});

<DataTable.Root
    table={table}
    renderSubComponent={(row) => <Detail row={row.original} />}
>
    <DataTable.Header />
    <DataTable.Body />
</DataTable.Root>`}</code>
            </pre>
        </Flex>

        <Flex direction='column' gap={4}>
            <Heading size='md'>Multi-row expansion</Heading>
            <Text>
                Opt into several rows being open at once with
                enableMultiRowExpansion. Opening a row no longer collapses the
                others.
            </Text>

            <ExpandableExample enableMultiRowExpansion />

            <pre>
                <code>{`
const table = useDataTable({
    data,
    columns: [getExpanderColumn(), ...columns],
    getRowCanExpand: () => true,
    getExpandedRowModel: getExpandedRowModel(),
    enableMultiRowExpansion: true,
});`}</code>
            </pre>
        </Flex>
    </Flex>
);

// onRowClick makes every row interactive (here without an expander column, to
// show it stands alone). It fires on click and on keyboard activation
// (Tab to a row, then Enter/Space), receiving the row and the event.
const RowClickExample = () => {
    const [selected, setSelected] = React.useState<FlowLog | null>(null);
    const table = useDataTable({ data, columns });

    return (
        <Flex direction='column' gap={2}>
            <Text fontSize='sm'>
                Selected:{' '}
                {selected
                    ? `${selected.source} → ${selected.destination}`
                    : 'none (click a row, or Tab to one and press Enter)'}
            </Text>
            <DataTable.Root
                table={table}
                onRowClick={(row) => setSelected(row.original)}
            >
                <DataTable.Header />
                <DataTable.Body />
            </DataTable.Root>
        </Flex>
    );
};

export const WithRowClick: Story = () => (
    <Flex direction='column' gap={4}>
        <RowClickExample />

        <pre>
            <code>{`
const table = useDataTable({ data, columns });

<DataTable.Root
    table={table}
    onRowClick={(row, event) => setSelected(row.original)}
>
    <DataTable.Header />
    <DataTable.Body />
</DataTable.Root>`}</code>
        </pre>
    </Flex>
);
