/** @type {import('@ladle/react').Config} */
export default {
    stories: 'src/**/*.stories.{js,jsx,ts,tsx}',
    viteConfig: '.ladle/vite.config.ts',
    // Whisker forces dark mode in the running app (see DarkModeGuard); default
    // the Ladle theme to dark so stories match what ships.
    addons: {
        theme: {
            enabled: true,
            defaultState: 'dark',
        },
        width: {
            enabled: true,
            options: {
                xsmall: 414,
                small: 640,
                medium: 768,
                large: 1024,
            },
            defaultState: 0,
        },
    },
};
