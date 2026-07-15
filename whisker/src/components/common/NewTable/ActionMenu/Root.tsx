import { Menu, type MenuProps } from '@chakra-ui/react';

// Root owns the Chakra Menu that ties the trigger and list together. Lazy by
// default so the list only mounts when opened; everything else passes through.
function Root({ isLazy = true, children, ...props }: MenuProps) {
    return (
        <Menu isLazy={isLazy} {...props}>
            {children}
        </Menu>
    );
}

export default Root;
