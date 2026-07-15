import type { Story, StoryDefault } from '@ladle/react';
import { Flex, Text } from '@chakra-ui/react';

import DataTable, { useDataTable } from './index';
import { columns } from './stories.fixtures';

const data = Array.from({ length: 100000 }, (_, i) => ({
    source: `default/frontend-${i}`,
    destination: `default/backend-${i % 25}`,
    protocol: i % 2 === 0 ? 'tcp' : 'udp',
    action: i % 3 === 0 ? 'Deny' : 'Allow',
}));

export default {
    title: 'Common / NewTable',
} satisfies StoryDefault;

// Only the rows in view are in the DOM; scroll the bounded container to page
// through 1,000 rows without rendering them all.
export const Virtualized: Story = () => {
    const table = useDataTable({ data, columns });

    return (
        <Flex direction='column' gap={4}>
            <Text>Virtualizing 100,000 rows</Text>
            <DataTable.Root table={table} containerProps={{ maxH: '400px' }}>
                <DataTable.Header />
                <DataTable.VirtualBody estimateRowHeight={37} overscan={10} />
            </DataTable.Root>

            <pre>
                <code>{`
const table = useDataTable({ data, columns }); // 1,000 rows

<DataTable.Root table={table} containerProps={{ maxH: 400 }}>
    <DataTable.Header />
    <DataTable.VirtualBody />
</DataTable.Root>`}</code>
            </pre>
        </Flex>
    );
};
