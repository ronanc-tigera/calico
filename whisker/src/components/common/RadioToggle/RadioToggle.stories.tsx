import * as React from 'react';
import type { Story, StoryDefault } from '@ladle/react';

import RadioToggleGroup, { type RadioToggleOption } from './index';

export default {
    title: 'Common / RadioToggle',
} satisfies StoryDefault;

const options: RadioToggleOption[] = [
    { value: 'all', label: 'All' },
    { value: 'allow', label: 'Allow' },
    { value: 'deny', label: 'Deny' },
];

export const Default: Story = () => {
    const [value, setValue] = React.useState<string | undefined>('all');

    return (
        <RadioToggleGroup
            name='policy-action'
            value={value}
            onChange={setValue}
            options={options}
        />
    );
};

export const NoSelection: Story = () => {
    const [value, setValue] = React.useState<string | undefined>(undefined);

    return (
        <RadioToggleGroup
            name='policy-action-empty'
            value={value}
            onChange={setValue}
            options={options}
        />
    );
};
