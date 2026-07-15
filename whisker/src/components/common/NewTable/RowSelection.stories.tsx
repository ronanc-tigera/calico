import type { Story, StoryDefault } from '@ladle/react';
import { Flex, Text } from '@chakra-ui/react';

import DataTable, { getSelectColumn, useDataTable } from './index';
import { columns, data, type FlowLog } from './stories.fixtures';

export default {
    title: 'Common / NewTable',
} satisfies StoryDefault;

// Prepend getSelectColumn() for a checkbox column: the header checkbox toggles
// every row (indeterminate when only some are checked), each cell toggles its
// row. Read the checked rows off table.getSelectedRowModel().
export const WithRowSelection: Story = () => {
    const table = useDataTable({
        data,
        columns: [getSelectColumn<FlowLog>(), ...columns],
    });

    const selected = table.getSelectedRowModel().rows;

    return (
        <Flex direction='column' gap={4}>
            <DataTable.Root table={table}>
                <DataTable.Header />
                <DataTable.Body />
            </DataTable.Root>

            <Text>{selected.length} row(s) selected</Text>

            <pre>
                <code>{`
const table = useDataTable({
    data,
    columns: [getSelectColumn(), ...columns],
});

const selected = table.getSelectedRowModel().rows;

<DataTable.Root table={table}>
    <DataTable.Header />
    <DataTable.Body />
</DataTable.Root>`}</code>
            </pre>
        </Flex>
    );
};
