import * as React from 'react';
import { flexRender, type Row as RowType } from '@tanstack/react-table';
import {
    Tr as ChakraTr,
    Td as ChakraTd,
    type TableRowProps,
} from '@chakra-ui/react';
import { useDataTableContext } from './context';

// Chakra props (not plain 'tr' props), matching Cell/HeaderCell: a consumer
// owning the row loop styles rows with props right where they're rendered —
// including emotion-backed ones like `animation`, which need to flow through
// Chakra's style-prop pipeline to work.
type RowProps<TData> = TableRowProps & {
    row: RowType<TData>;
    // Set by VirtualBody: the virtualizer measures the row through this ref and
    // reads its position from data-index. Unused in the non-virtualized Body.
    measureRef?: React.Ref<HTMLTableRowElement>;
    'data-index'?: number;
};

function Row<TData>({ row, children, measureRef, ...props }: RowProps<TData>) {
    // renderSubComponent and onRowClick come from context (set on Root), not
    // from Body — so Body never has to forward them.
    const { renderSubComponent, onRowClick } = useDataTableContext<TData>();
    const cells = row.getVisibleCells();
    const isExpanded = row.getIsExpanded();
    const canExpand = row.getCanExpand();

    // The row becomes a single interactive control when the consumer wired an
    // onRowClick handler or the row can expand. Clicking anywhere on it — or
    // focusing it and pressing Enter/Space — toggles expansion and fires
    // onRowClick. This is the whole-row affordance the old DataTable had, but
    // implemented as a real focusable <tr> rather than a hidden
    // parentElement.click() forwarded off the first cell. The chevron
    // (Expander) is a decorative indicator whose clicks fall through to here;
    // the checkbox (RowCheckbox) and action menu each stop propagation, so
    // operating them never doubles as a row activation.
    const interactive = Boolean(onRowClick) || canExpand;

    const activate = (event: React.MouseEvent | React.KeyboardEvent) => {
        if (canExpand) {
            row.toggleExpanded();
        }
        onRowClick?.(row, event);
    };

    const interactiveProps: React.ComponentProps<typeof ChakraTr> = interactive
        ? {
              tabIndex: 0,
              cursor: 'pointer',
              // A row is an expand/collapse control only when it can expand; a
              // click-only row (onRowClick without expansion) carries no
              // expanded state.
              'aria-expanded': canExpand ? isExpanded : undefined,
              _focusVisible: { boxShadow: 'outline' },
              onClick: (event) => {
                  props.onClick?.(event);
                  activate(event);
              },
              onKeyDown: (event) => {
                  props.onKeyDown?.(event);
                  // Only when the row itself holds focus: an Enter/Space meant
                  // for an inner control (its target) must not also toggle the
                  // row.
                  if (
                      event.currentTarget === event.target &&
                      (event.key === 'Enter' || event.key === ' ')
                  ) {
                      // Space would otherwise scroll the page.
                      event.preventDefault();
                      activate(event);
                  }
              },
          }
        : {};

    return (
        <>
            <ChakraTr
                ref={measureRef}
                data-slot='table-row'
                data-state={row.getIsSelected() ? 'selected' : undefined}
                data-expanded={isExpanded || undefined}
                {...props}
                {...interactiveProps}
            >
                {children ??
                    cells.map((cell) => (
                        <React.Fragment key={cell.id}>
                            {flexRender(
                                cell.column.columnDef.cell,
                                cell.getContext(),
                            )}
                        </React.Fragment>
                    ))}
            </ChakraTr>

            {isExpanded && renderSubComponent && (
                <ChakraTr data-slot='table-row-expanded'>
                    <ChakraTd colSpan={cells.length}>
                        {renderSubComponent(row)}
                    </ChakraTd>
                </ChakraTr>
            )}
        </>
    );
}

export default Row;
