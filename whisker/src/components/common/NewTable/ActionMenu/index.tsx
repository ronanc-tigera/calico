import { MenuItem } from '@chakra-ui/react';
import Button from './Button';
import List from './List';
import Root from './Root';

// Composable action menu for table rows, built on Chakra's Menu. Unlike the old
// monolithic DataTable ActionMenu (buttonValue/buttonAriaLabel props), the
// consumer composes each part and owns its props, so custom triggers, item
// contents, and menu styling need no new props here:
//
//   <ActionMenu.Root>
//       <ActionMenu.Button aria-label='Row actions'>Actions</ActionMenu.Button>
//       <ActionMenu.List>
//           <ActionMenu.Item onClick={onView}>View</ActionMenu.Item>
//           <ActionMenu.Item onClick={onDelete}>Delete</ActionMenu.Item>
//       </ActionMenu.List>
//   </ActionMenu.Root>
const ActionMenu = {
    Root,
    Button,
    List,
    // MenuItem already exposes the full composable item API (icon, command,
    // onClick, isDisabled, …); re-export it rather than wrap and re-narrow it.
    Item: MenuItem,
};

export default ActionMenu;
