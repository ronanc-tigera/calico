import type { TableCellProps } from '@chakra-ui/react';
import Cell from './Cell';

// A Cell preset for action/control columns — a checkbox, chevron, or row action
// menu rather than a data value. width:1% collapses the column to its content so
// it doesn't claim a share of the table width; the padding is shared with
// ActionHeaderCell so the control lines up between header and body. Any prop
// overrides the preset.
function ActionCell(props: TableCellProps) {
    return <Cell {...props} />;
}

export default ActionCell;
