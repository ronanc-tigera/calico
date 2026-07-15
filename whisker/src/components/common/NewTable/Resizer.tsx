import { type Header } from '@tanstack/react-table';
import { Box } from '@chakra-ui/react';

import { useDataTableContext } from './context';

type ResizerProps<TData> = {
    // The TanStack header whose column this handle resizes.
    header: Header<TData, unknown>;
};

// Drag handle for resizing a column, following TanStack's column-sizing guide:
// getResizeHandler() wires the pointer drag (mouse + touch), getIsResizing()
// styles the active handle, and a double-click resets the column to its defined
// size. HeaderCell renders one on the trailing edge of every resizable header.
//
// In the default 'onEnd' resize mode the column commits its new width only on
// release, so the handle is translated to follow the cursor mid-drag for
// feedback (deltaOffset). In 'onChange' mode the column tracks live, so the
// handle stays put and no transform is needed.
function Resizer<TData>({ header }: ResizerProps<TData>) {
    const { table } = useDataTableContext<TData>();
    const isResizing = header.column.getIsResizing();
    const direction = table.options.columnResizeDirection ?? 'ltr';
    const edge = direction === 'rtl' ? 'left' : 'right';

    const transform =
        table.options.columnResizeMode === 'onEnd' && isResizing
            ? `translateX(${
                  (direction === 'rtl' ? -1 : 1) *
                  (table.getState().columnSizingInfo.deltaOffset ?? 0)
              }px)`
            : undefined;

    return (
        <Box
            data-slot='table-resizer'
            data-testid='column-resizer'
            onMouseDown={header.getResizeHandler()}
            onTouchStart={header.getResizeHandler()}
            // Reset to the column's defined size on double-click.
            onDoubleClick={() => header.column.resetSize()}
            // A click never means "sort": the handle sits inside the header
            // cell, so swallow it before it can reach a sortable header's
            // toggle.
            onClick={(e) => e.stopPropagation()}
            position='absolute'
            top={0}
            {...{ [edge]: 0 }}
            zIndex={1}
            h='full'
            // Wide-ish hit area; the visible line is the thin ::after below.
            w='5px'
            cursor='col-resize'
            userSelect='none'
            transform={transform}
            sx={{ touchAction: 'none' }}
            _after={{
                content: '""',
                position: 'absolute',
                top: 0,
                bottom: 0,
                [edge]: 0,
                width: '2px',
                bg: isResizing
                    ? 'experimental-token-bg-brand-accent'
                    : 'transparent',
            }}
            _hover={{
                _after: {
                    bg: isResizing
                        ? 'experimental-token-bg-brand-accent'
                        : 'experimental-color-neutral.300',
                },
            }}
        />
    );
}

export default Resizer;
