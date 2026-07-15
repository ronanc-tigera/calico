import { fireEvent, render, screen } from '@/test-utils/helper';
import ActionMenu from '../index';

const renderMenu = (onSelect = jest.fn()) =>
    render(
        <ActionMenu.Root>
            <ActionMenu.Button aria-label='Row actions'>
                Actions
            </ActionMenu.Button>
            <ActionMenu.List>
                <ActionMenu.Item onClick={onSelect}>View</ActionMenu.Item>
            </ActionMenu.List>
        </ActionMenu.Root>,
    );

// jsdom doesn't implement scrollTo, which Chakra's Menu calls when focusing an
// item after it opens.
beforeAll(() => {
    Element.prototype.scrollTo = jest.fn();
});

describe('<ActionMenu/>', () => {
    it('renders the trigger and reveals items on open', () => {
        renderMenu();

        const button = screen.getByTestId('action-menu-button');
        expect(button).toHaveTextContent('Actions');
        expect(button).toHaveAttribute('aria-label', 'Row actions');

        fireEvent.click(button);

        expect(screen.getByText('View')).toBeInTheDocument();
    });

    it('fires the item handler when selected', () => {
        const onSelect = jest.fn();
        renderMenu(onSelect);

        fireEvent.click(screen.getByTestId('action-menu-button'));
        fireEvent.click(screen.getByText('View'));

        expect(onSelect).toHaveBeenCalledTimes(1);
    });

    it('stops the trigger click from propagating to the row', () => {
        const onRowClick = jest.fn();

        render(
            <div onClick={onRowClick}>
                <ActionMenu.Root>
                    <ActionMenu.Button aria-label='Row actions'>
                        Actions
                    </ActionMenu.Button>
                    <ActionMenu.List>
                        <ActionMenu.Item>View</ActionMenu.Item>
                    </ActionMenu.List>
                </ActionMenu.Root>
            </div>,
        );

        fireEvent.click(screen.getByTestId('action-menu-button'));

        expect(onRowClick).not.toHaveBeenCalled();
    });
});
