import { Icon } from '@chakra-ui/react';
import type { SortDirection } from '@tanstack/react-table';

import { TableAscendingSortIcon, TableSortIcon } from '../../../icons';

type SorterProps = {
    // The column's current sort direction, or false when the column is sortable
    // but not the active sort key (getIsSorted()'s return type).
    direction: SortDirection | false;
};

// Sort indicator for a sortable column header. A dimmed neutral glyph when the
// column isn't the active sort key; the brand-accent arrow when it is, pointing
// up for ascending and flipped for descending. Mirrors the old DataTable's
// Sorter, but decorative — the header's aria-sort conveys state to assistive
// tech, so this is aria-hidden.
function Sorter({ direction }: SorterProps) {
    const isActive = direction !== false;

    return (
        <Icon
            as={isActive ? TableAscendingSortIcon : TableSortIcon}
            aria-hidden
            data-testid='column-sorter'
            sx={{
                boxSize: 3,
                flexShrink: 0,
                fill: isActive
                    ? 'experimental-token-bg-brand-accent'
                    : 'experimental-color-neutral.300',
                // The ascending icon points up; flip it for descending.
                ...(direction === 'desc' && { transform: 'scaleY(-1)' }),
            }}
        />
    );
}

export default Sorter;
