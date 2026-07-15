import type { Story, StoryDefault } from '@ladle/react';
import { Flex } from '@chakra-ui/react';

import DataTable, { useDataTable } from './index';
import { columnHelper, columns, data } from './stories.fixtures';

export default {
    title: 'Common / NewTable',
} satisfies StoryDefault;

export const WithActionMenu: Story = () => {
    const actionColumns = [
        ...columns,
        columnHelper.display({
            id: 'actions',
            header: '',
            size: 80,
            cell: () => (
                <DataTable.Cell>
                    <DataTable.ActionMenu.Root>
                        <DataTable.ActionMenu.Button aria-label='Row actions'>
                            Actions
                        </DataTable.ActionMenu.Button>
                        <DataTable.ActionMenu.List>
                            <DataTable.ActionMenu.Item>
                                View details
                            </DataTable.ActionMenu.Item>
                            <DataTable.ActionMenu.Item>
                                Copy
                            </DataTable.ActionMenu.Item>
                        </DataTable.ActionMenu.List>
                    </DataTable.ActionMenu.Root>
                </DataTable.Cell>
            ),
        }),
    ];

    const table = useDataTable({ data, columns: actionColumns });

    return (
        <Flex direction='column' gap={4}>
            <DataTable.Root table={table}>
                <DataTable.Header />
                <DataTable.Body />
            </DataTable.Root>

            <pre>
                <code>{`
// A custom cell renders its own <DataTable.Cell> (the <td>).
cell: () => (
    <DataTable.Cell>
        <DataTable.ActionMenu.Root>
            <DataTable.ActionMenu.Button aria-label='Row actions'>
                Actions
            </DataTable.ActionMenu.Button>
            <DataTable.ActionMenu.List>
                <DataTable.ActionMenu.Item>View details</DataTable.ActionMenu.Item>
                <DataTable.ActionMenu.Item>Copy</DataTable.ActionMenu.Item>
            </DataTable.ActionMenu.List>
        </DataTable.ActionMenu.Root>
    </DataTable.Cell>
)`}</code>
            </pre>
        </Flex>
    );
};
