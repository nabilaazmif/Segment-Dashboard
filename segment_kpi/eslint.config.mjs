import fioriTools from '@sap-ux/eslint-plugin-fiori-tools';

export default [
    ...fioriTools.configs.recommended,
    {
        files: ['webapp/**/*.js'],
        languageOptions: {
            globals: {
                // UI5 1.108 runs on browsers that all provide these.
                Promise: 'readonly',
                Object: 'readonly'
            }
        },
        rules: {
            // sap.ui.define needs one parameter per dependency.
            'max-params': 'off'
        }
    }
];
