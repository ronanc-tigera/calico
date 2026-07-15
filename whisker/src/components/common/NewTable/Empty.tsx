import * as React from 'react';
import {
    Tbody as ChakraTbody,
    Tr as ChakraTr,
    Td as ChakraTd,
} from '@chakra-ui/react';
import { useDataTableContext } from './context';

// Self-gating empty state: renders only when the table has no rows, and owns
// the tr/td/colSpan mechanics so consumers compose plain content. Defaults to
// "No results" when no children are provided.
function Empty({ children, ...props }: React.ComponentProps<'div'>) {
    const { table } = useDataTableContext();

    if (table.getRowModel().rows.length > 0) {
        return null;
    }

    return (
        <ChakraTbody data-slot='table-body'>
            <ChakraTr data-slot='table-row'>
                <ChakraTd colSpan={table.getAllLeafColumns().length}>
                    <div data-slot='table-empty-state' {...props}>
                        {children ?? 'No results'}
                    </div>
                </ChakraTd>
            </ChakraTr>
        </ChakraTbody>
    );
}

export default Empty;
