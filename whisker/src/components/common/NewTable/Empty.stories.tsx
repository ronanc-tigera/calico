import type { Story, StoryDefault } from '@ladle/react';
import { Button, Flex } from '@chakra-ui/react';

import DataTable, { useDataTable } from './index';
import { columns, type FlowLog } from './stories.fixtures';

export default {
    title: 'Common / NewTable',
} satisfies StoryDefault;

export const Empty: Story = () => {
    const table = useDataTable({ data: [] as FlowLog[], columns });

    return (
        <Flex direction='column' gap={4}>
            <Button>Add flow log</Button>
            <DataTable.Root table={table}>
                <DataTable.Header />
                <DataTable.Body />
                <DataTable.Empty>No flow logs to display</DataTable.Empty>
            </DataTable.Root>

            <pre>
                <code>{`
<DataTable.Root table={table}>
    <DataTable.Header />
    <DataTable.Body />
    <DataTable.Empty>No flow logs to display</DataTable.Empty>
</DataTable.Root>`}</code>
            </pre>
        </Flex>
    );
};
