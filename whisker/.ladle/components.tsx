import type { GlobalProvider } from '@ladle/react';

import { ChakraProvider, LightMode } from '@chakra-ui/react';
import { theme } from '../src/theme';
// Pull in the same global stylesheets the app loads in src/main.tsx so
// Tailwind utilities and the Tigera design-system tokens are available to
// stories. ChakraProvider (via DarkModeGuard) forces dark mode, matching the
// running app.
import '@/index.css';
import '@/styles/global.css';

export const Provider: GlobalProvider = ({ children }) => (
    <ChakraProvider theme={theme}>
        <LightMode>{children}</LightMode>
    </ChakraProvider>
);
