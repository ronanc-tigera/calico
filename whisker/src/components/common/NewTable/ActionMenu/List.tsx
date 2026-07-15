import { MenuList, type MenuListProps } from '@chakra-ui/react';

// List holds the menu items. Thin passthrough so the consumer keeps full
// control over the list contents and styling.
function List({ children, ...props }: MenuListProps) {
    return <MenuList {...props}>{children}</MenuList>;
}

export default List;
