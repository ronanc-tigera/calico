import type { Story, StoryDefault } from '@ladle/react';
import { Flex } from '@chakra-ui/react';

import DataTable, { useDataTable } from './index';
import { columns, data } from './stories.fixtures';

export default {
    title: 'Common / NewTable',
} satisfies StoryDefault;

export const Default: Story = () => {
    const table = useDataTable({ data, columns });

    return (
        <Flex direction='column' gap={4}>
            <DataTable.Root table={table}>
                <DataTable.Header />
                <DataTable.Body />
            </DataTable.Root>

            <pre>
                <code>{`
<DataTable.Root table={table}>
    <DataTable.Header />
    <DataTable.Body />
</DataTable.Root>`}</code>
            </pre>
        </Flex>
    );
};
