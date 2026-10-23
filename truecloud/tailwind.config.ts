import type { Config } from 'tailwindcss';

const config: Config = {
    content: ['./src/**/*.{ts,tsx}'],
    theme: {
        extend: {
            colors: {
                brand: {
                    50: '#eef5ff',
                    100: '#d9e8ff',
                    200: '#bcd7ff',
                    300: '#8ebeff',
                    400: '#599aff',
                    500: '#3374ff',
                    600: '#1b53f5',
                    700: '#143fe1',
                    800: '#1734b6',
                    900: '#19318f',
                    950: '#141f57'
                },
                ink: {
                    50: '#f6f7f9',
                    100: '#eceef2',
                    200: '#d5d9e2',
                    300: '#b0b8c9',
                    400: '#8592ab',
                    500: '#667491',
                    600: '#515d78',
                    700: '#434c62',
                    800: '#3a4253',
                    900: '#1f2430',
                    950: '#0d1018'
                }
            },
            fontFamily: {
                sans: ['ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif']
            },
            boxShadow: {
                card: '0 1px 2px rgba(13,16,24,0.04), 0 4px 16px rgba(13,16,24,0.06)'
            }
        }
    },
    plugins: []
};

export default config;
