import * as React from 'react';
import type { Story, StoryDefault } from '@ladle/react';
import {
    type ColumnResizeMode,
    type ColumnSizingState,
} from '@tanstack/react-table';
import { Button, Code, Flex, Heading, Text } from '@chakra-ui/react';

import DataTable, { useDataTable } from './index';
import { columnHelper, data } from './stories.fixtures';

export default {
    title: 'Common / NewTable',
} satisfies StoryDefault;

// size sets the starting width; minSize/maxSize bound how far a drag can go.
const columns = [
    columnHelper.accessor('source', {
        header: 'Source',
        minSize: 200,
        // size: 300,
        // maxSize: 400,
    }),
    columnHelper.accessor('destination', {
        header: 'Destination',
        minSize: 120,
    }),
    columnHelper.accessor('protocol', {
        header: 'Protocol',
        size: 120,
        // maxSize: 200,
    }),
    // Opt a single column out of resizing. As the last column it also flexes
    // to fill the container's remaining width.
    columnHelper.accessor('action', {
        header: 'Action',
        size: 120,
        enableResizing: false,
    }),
];

// Uncontrolled: enableColumnResizing turns on a drag handle per column and the
// table manages the widths itself. Toggle the mode to feel the difference:
// onChange resizes live as you drag; onEnd commits on release.
const UncontrolledResizingTable = () => {
    const [mode, setMode] = React.useState<ColumnResizeMode>('onChange');

    const table = useDataTable({
        data,
        columns,
        enableColumnResizing: true,
        columnResizeMode: mode,
    });

    return (
        <Flex direction='column' gap={4} alignItems='flex-start'>
            <Flex gap={2}>
                {(['onChange', 'onEnd'] as const).map((m) => (
                    <Button
                        key={m}
                        size='sm'
                        variant={mode === m ? 'solid' : 'ghost'}
                        onClick={() => setMode(m)}
                    >
                        {m}
                    </Button>
                ))}
            </Flex>

            <DataTable.Root table={table}>
                <DataTable.Header />
                <DataTable.Body />
            </DataTable.Root>
        </Flex>
    );
};

// Controlled: the parent owns columnSizing (state + onColumnSizingChange), so
// it can read, persist, or reset the widths. The Reset button clears the state
// back to the columns' defined sizes.
const ControlledResizingTable = () => {
    const [columnSizing, setColumnSizing] = React.useState<ColumnSizingState>(
        {},
    );

    const table = useDataTable({
        data,
        columns,
        enableColumnResizing: true,
        columnResizeMode: 'onChange',
        state: { columnSizing },
        onColumnSizingChange: setColumnSizing,
    });

    return (
        <Flex direction='column' gap={4} alignItems='flex-start'>
            <Button
                size='sm'
                variant='ghost'
                onClick={() => setColumnSizing({})}
            >
                Reset widths
            </Button>

            <DataTable.Root table={table}>
                <DataTable.Header />
                <DataTable.Body />
            </DataTable.Root>

            <Code>columnSizing = {JSON.stringify(columnSizing)}</Code>
        </Flex>
    );
};

const UNCONTROLLED_SNIPPET = `
const columns = [
    columnHelper.accessor('source', { header: 'Source', minSize: 120 }),
    columnHelper.accessor('destination', { header: 'Destination' }),
    columnHelper.accessor('protocol', { header: 'Protocol', maxSize: 200 }),
    // Opt a column out of resizing.
    columnHelper.accessor('action', { header: 'Action', enableResizing: false }),
];

const table = useDataTable({
    data,
    columns,
    enableColumnResizing: true,
    columnResizeMode: 'onChange', // or 'onEnd' (default)
});

<DataTable.Root table={table}>
    <DataTable.Header />
    <DataTable.Body />
</DataTable.Root>`;

const CONTROLLED_SNIPPET = `
const [columnSizing, setColumnSizing] = React.useState({});

const table = useDataTable({
    data,
    columns,
    enableColumnResizing: true,
    state: { columnSizing },
    onColumnSizingChange: setColumnSizing,
});`;

export const WithResizing: Story = () => (
    <Flex direction='column' gap={32}>
        <Flex direction='column' gap={4}>
            <Heading size='md'>Resizing</Heading>
            <Text>
                Set enableColumnResizing and each column grows a drag handle on
                its right edge. Drag to resize, double-click a handle to reset,
                and bound a column with size / minSize / maxSize. Opt one out
                with enableResizing: false. The table fills its container — the
                last column takes up whatever width is left over.
            </Text>

            <UncontrolledResizingTable />

            <pre>
                <code>{UNCONTROLLED_SNIPPET}</code>
            </pre>
        </Flex>

        <Flex direction='column' gap={4}>
            <Heading size='md'>Controlled resizing</Heading>
            <Text>
                Own the columnSizing state to read the widths, persist them, or
                set them from elsewhere — here, the Reset button clears them
                back to the defined sizes.
            </Text>

            <ControlledResizingTable />

            <pre>
                <code>{CONTROLLED_SNIPPET}</code>
            </pre>
        </Flex>
    </Flex>
);
