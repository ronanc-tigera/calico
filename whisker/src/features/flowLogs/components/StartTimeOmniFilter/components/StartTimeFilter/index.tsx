import {
    OmniFilterBody,
    OmniFilterContainer,
    OmniFilterContent,
    OmniFilterTrigger,
} from '@/libs/tigera/ui-components/components/common/OmniFilter/parts';
import { OmniFilterOption } from '@/libs/tigera/ui-components/components/common/OmniFilter/types';
import Select from '@/libs/tigera/ui-components/components/common/Select';
import OmniFilterFooter from '@/features/flowLogs/components/OmniFilterFooter';
import React from 'react';
import { SelectStyles } from '@/libs/tigera/ui-components/components/common/Select/styles';

const testId = 'start-time';

type StartTimeFilterProps = {
    filterLabel: string;
    triggerLabel: string;
    value: OmniFilterOption;
    isActive: boolean;
    options: OmniFilterOption[];
    hasChanged: boolean;
    onChange: (value: OmniFilterOption) => void;
    onClick: () => void;
    onReset: () => void;
};

const StartTimeFilter: React.FC<StartTimeFilterProps> = ({
    filterLabel,
    triggerLabel,
    isActive,
    options,
    value,
    hasChanged,
    onClick,
    onChange,
    onReset,
}) => (
    <OmniFilterContainer>
        {({ onClose }) => (
            <>
                <OmniFilterTrigger
                    label={filterLabel}
                    testId={testId}
                    selectedValueLabel={triggerLabel}
                    onClick={() => {
                        onClick();
                    }}
                    isActive={isActive}
                />
                <OmniFilterContent data-testid={`${testId}-popover-content`}>
                    <OmniFilterBody
                        data-testid={`${testId}-popover-body`}
                        p={0}
                    >
                        <Select
                            menuIsOpen
                            controlShouldRenderValue={false}
                            hideSelectedOptions={false}
                            autoFocus
                            components={{
                                DropdownIndicator: null,
                                IndicatorSeparator: null,
                                Control: () => null,
                            }}
                            backspaceRemovesValue={false}
                            tabSelectsValue={false}
                            options={options}
                            isSearchable={false}
                            isClearable={false}
                            value={value}
                            onChange={(newValue) => {
                                onChange(newValue);
                                onClose();
                            }}
                            sx={{
                                menu: (styles) => ({
                                    ...styles,
                                    ...SelectStyles.menu,
                                    position: 'relative',
                                    my: 0,
                                }),
                                option: (styles) => ({
                                    ...styles,
                                    ...SelectStyles.option,
                                    _dark: {
                                        ...SelectStyles.option._dark,
                                        background: 'tigeraGrey.1000',
                                    },
                                }),
                            }}
                        />
                    </OmniFilterBody>
                    <OmniFilterFooter
                        testId={testId}
                        leftButtonProps={{
                            onClick: () => {
                                onReset();
                                onClose();
                            },
                            children: 'Reset filter',
                            isDisabled: !hasChanged,
                        }}
                    />
                </OmniFilterContent>
            </>
        )}
    </OmniFilterContainer>
);

export default StartTimeFilter;
