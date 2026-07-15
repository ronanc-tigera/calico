import * as React from 'react';
import { flexRender } from '@tanstack/react-table';
import { useDataTableContext } from './context';
import { Thead as ChakraThead, Tr as ChakraTr } from '@chakra-ui/react';
import HeaderCell from './HeaderCell';

function Header(props: React.ComponentProps<'thead'>) {
    const { table } = useDataTableContext();

    return (
        <ChakraThead data-slot='table-header' {...props}>
            {table.getHeaderGroups().map((headerGroup) => (
                <ChakraTr key={headerGroup.id} borderBottom='none'>
                    {headerGroup.headers.map((header) => {
                        const content = header.isPlaceholder
                            ? null
                            : flexRender(
                                  header.column.columnDef.header,
                                  header.getContext(),
                              );

                        // A non-string header renderer returns an element (its
                        // own HeaderCell); render that directly. A plain string
                        // header is wrapped in a default cell carrying the
                        // column's size — and, when the table has a sorted row
                        // model, its sort toggle (HeaderCell falls back to a
                        // plain cell otherwise).
                        if (React.isValidElement(content)) {
                            return React.cloneElement(content, {
                                key: header.id,
                            });
                        }

                        return (
                            <HeaderCell key={header.id} header={header}>
                                {content}
                            </HeaderCell>
                        );
                    })}
                </ChakraTr>
            ))}
        </ChakraThead>
    );
}

export default Header;
