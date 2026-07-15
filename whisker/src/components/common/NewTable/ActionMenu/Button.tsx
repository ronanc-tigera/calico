import { Button as ChakraButton, MenuButton, type ButtonProps } from '@chakra-ui/react';
import { ChevronDownIcon } from '@chakra-ui/icons';

// Button is the menu trigger. It keeps the ghost + chevron styling of the old
// DataTable ActionMenu and stops row click-through, but every default is
// overridable — pass your own rightIcon, variant, or children (the label).
function Button({
    children,
    onClick,
    rightIcon = <ChevronDownIcon w={5} h={5} />,
    ...props
}: ButtonProps) {
    return (
        <MenuButton
            as={ChakraButton}
            minWidth='90px'
            variant='ghost'
            data-testid='action-menu-button'
            rightIcon={rightIcon}
            onClick={(e) => {
                e.stopPropagation();
                onClick?.(e);
            }}
            {...props}
        >
            {children}
        </MenuButton>
    );
}

export default Button;
