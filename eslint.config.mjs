import globals from 'globals';
import pluginJs from '@eslint/js';

export default [
	{
		files: ['**/*.js'],
		languageOptions: {
			sourceType: 'commonjs',
		},
	},
	{
		languageOptions: {
			globals: {
				...globals.browser,
				process: 'readonly',
				writeDb: 'readonly',
				readDb: 'readonly',
				Buffer: 'readonly',
				__dirname: 'readonly',
				__filename: 'readonly',

			},
		},
	},
	pluginJs.configs.recommended,
	{
		rules: {
			// Possible Errors
			'no-await-in-loop': 'warn',
			'no-cond-assign': ['error', 'always'],
			'no-console': 'error',
			'no-debugger': 'error',
			'no-duplicate-imports': 'error',

			// Best Practices
			eqeqeq: ['error', 'always'],
			curly: ['error', 'all'],
			'dot-notation': 'error',
			'no-alert': 'error',
			'no-eval': 'error',
			'no-floating-decimal': 'error',
			'no-multi-spaces': 'error',
			'no-param-reassign': 'error',
			'no-return-assign': ['error', 'except-parens'],
			'no-throw-literal': 'error',
			'no-useless-return': 'error',
			// 'consistent-return': 'error',

			// Variables
			'no-shadow': 'error',
			'no-use-before-define': [
				'error',
				{ functions: true, classes: true, variables: true },
			],
			'no-undef-init': 'error',
			'no-unused-vars': [
				'error',
				{ vars: 'all', args: 'after-used', ignoreRestSiblings: true },
			],

			// Stylistic Issues
			'array-bracket-spacing': ['error', 'never'],
			'block-spacing': ['error', 'always'],
			'brace-style': ['error', '1tbs', { allowSingleLine: true }],
			'comma-dangle': ['error', 'always-multiline'],
			'func-call-spacing': ['error', 'never'],
			'key-spacing': ['error', { beforeColon: false, afterColon: true }],
			'keyword-spacing': ['error', { before: true, after: true }],
			'lines-between-class-members': [
				'error',
				'always',
				{ exceptAfterSingleLine: true },
			],
			'max-len': ['error', { code: 125, tabWidth: 4, ignoreUrls: true }],
			'no-lonely-if': 'error',
			'no-multiple-empty-lines': ['error', { max: 1, maxEOF: 1 }],
			'object-curly-newline': ['error', { multiline: true, consistent: true }],
			'operator-linebreak': ['error', 'before'],
			'padded-blocks': ['error', 'never'],
			'spaced-comment': ['error', 'always', { markers: ['/'] }],

			// ECMAScript 6
			'arrow-body-style': ['error', 'as-needed'],
			'arrow-parens': ['error', 'always'],
			'generator-star-spacing': ['error', { before: false, after: true }],
			'no-useless-computed-key': 'error',
			'prefer-arrow-callback': 'error',
			'prefer-destructuring': ['error', { array: true, object: true }],
			'prefer-numeric-literals': 'error',
			'prefer-rest-params': 'error',
			'prefer-template': 'error',

			// Your existing rules
			indent: ['error', 'tab'],
			'linebreak-style': ['error', 'unix'],
			quotes: ['error', 'single'],
			semi: ['error', 'always'],
			camelcase: ['error'],
			'no-undef': ['error'],
			'prefer-const': ['error'],
			'no-var': ['error'],
			'no-extra-semi': ['error'],
			'arrow-spacing': ['error'],
			'comma-spacing': ['error'],
			'object-curly-spacing': ['error', 'always'],
			'space-before-function-paren': ['error', 'always'],
			'space-in-parens': ['error', 'never'],
			'space-before-blocks': ['error', 'always'],
			'padding-line-between-statements': [
				'error',
				{ blankLine: 'always', prev: '*', next: 'block' },
				{ blankLine: 'always', prev: 'block', next: '*' },
				{ blankLine: 'always', prev: '*', next: 'function' },
				{ blankLine: 'always', prev: 'function', next: '*' },
			],
		},
	},
];
