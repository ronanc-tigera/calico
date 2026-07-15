import type { Story, StoryDefault } from '@ladle/react';
import { Flex, Text } from '@chakra-ui/react';

import DataTable, { useDataTable } from './index';
import { columns } from './stories.fixtures';

const data = Array.from({ length: 50 }, (_, i) => ({
    source: `default/frontend-${i}`,
    destination: `default/backend-${i % 25}`,
    protocol: i % 2 === 0 ? 'tcp' : 'udp',
    action: i % 3 === 0 ? 'Deny' : 'Allow',
}));

export default {
    title: 'Common / NewTable',
} satisfies StoryDefault;

// The header pins to the top of the bounded scroll container: scroll the body
// and the column headers stay in view. On by default; pass stickyHeader={false}
// to Root for a header that scrolls away with the body.
export const StickyHeader: Story = () => {
    const table = useDataTable({ data, columns });

    return (
        <Flex direction='column' gap={4}>
            <Text>Scroll the table — the header stays pinned</Text>
            <DataTable.Root table={table} containerProps={{ maxH: '300px' }}>
                <DataTable.Header />
                <DataTable.Body />
            </DataTable.Root>

            <pre>
                <code>{`
<DataTable.Root table={table} containerProps={{ maxH: 300 }}>
    <DataTable.Header /> {/* sticky by default */}
    <DataTable.Body />
</DataTable.Root>`}</code>
            </pre>
        </Flex>
    );
};
