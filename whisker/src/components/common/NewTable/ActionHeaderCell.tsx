import type { TableColumnHeaderProps } from '@chakra-ui/react';
import HeaderCell from './HeaderCell';

// The header-side mirror of ActionCell: a HeaderCell preset for action/control
// columns. Shares width:1% and padding with ActionCell so a header control
// (e.g. select-all) lines up with the body controls below it. Any prop
// overrides the preset.
function ActionHeaderCell(props: TableColumnHeaderProps) {
    return (
        <HeaderCell
            width='1%'
            minW='4!important'
            w='4!important'
            maxW='4!important'
            {...props}
        />
    );
}

export default ActionHeaderCell;
