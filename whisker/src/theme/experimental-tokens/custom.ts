import { alpha } from './utils';

/**
 * Custom tokens outside of the design system that make tokens more flexible.
 *
 */

export default {
    // table
    'experimental-token-table-selected': {
        _light: 'experimental-token-bg-brand',
        _dark: alpha('experimental-color-medium-gold.600', 0.35),
    },
    'experimental-token-table-selected:hovered': {
        _light: 'experimental-token-bg-brand:hovered',
        _dark: alpha('experimental-color-medium-gold.700', 0.35),
    },
    'experimental-token-table-selected:pressed': {
        _light: 'experimental-token-bg-brand:pressed',
        _dark: alpha('experimental-color-medium-gold.800', 0.35),
    },
    'experimental-token-bg-table-expanded': {
        _light: 'experimental-token-elevation-sunken',
        _dark: 'experimental-token-elevation-sunken',
    },
    'experimental-token-bg-table-header': {
        _light: 'experimental-color-neutral.50',
        _dark: 'experimental-token-bg-neutral',
    },
    'experimental-token-on-table-selected': {
        _light: 'experimental-token-fg-inverted',
        _dark: 'experimental-token-fg-default',
    },

    // tabs
    'experimental-token-tabs-selected': {
        _light: 'experimental-color-medium-gold.500',
        _dark: 'experimental-token-bg-brand',
    },

    // menu
    'experimental-token-on-nav-menu': {
        _light: 'experimental-token-white',
        _dark: 'experimental-token-white',
    },
    'experimental-token-on-nav-menu:hovered': {
        _light: 'experimental-color-medium-gold.500',
        _dark: 'experimental-color-medium-gold.500',
    },

    // charts
    'experimental-token-chart-stroke': {
        _light: 'experimental-color-neutral.0',
        _dark: 'experimental-color-neutral.100',
    },
    'experimental-token-chart-cursor': {
        _light: 'experimental-color-light-alpha.100',
        _dark: 'experimental-color-dark-alpha.100',
    },

    // tags
    'experimental-token-bg-tag-negated': {
        _light: 'experimental-color-red.200',
        _dark: 'experimental-color-red.200',
    },
    'experimental-token-bg-tag-negated-action': {
        _light: 'experimental-color-red.600',
        _dark: 'experimental-color-red.400',
    },
};
