import prettier from 'eslint-config-prettier';
import path from 'node:path';
import js from '@eslint/js';
import svelte from 'eslint-plugin-svelte';
import { defineConfig, includeIgnoreFile } from 'eslint/config';
import globals from 'globals';
import ts from 'typescript-eslint';

const gitignorePath = path.resolve(import.meta.dirname, '.gitignore');

export default defineConfig(
	includeIgnoreFile(gitignorePath),
	{
		// The generated Capacitor native project (task F1, docs/PLAN-v0.4.md).
		// `android/` is committed (standard Capacitor practice: Gradle/Java/XML
		// config alongside our own build.gradle edits), but `cap sync` copies
		// the whole web build into android/app/src/main/assets/public — that's
		// already-linted, already-built output, not source, and android/'s own
		// .gitignore (not read by eslint's includeIgnoreFile, which only parses
		// the one path given above) is what keeps it out of git.
		ignores: ['android/**']
	},
	js.configs.recommended,
	ts.configs.recommended,
	svelte.configs.recommended,
	prettier,
	svelte.configs.prettier,
	{
		languageOptions: { globals: { ...globals.browser, ...globals.node } },
		rules: {
			// typescript-eslint strongly recommend that you do not use the no-undef lint rule on TypeScript projects.
			// see: https://typescript-eslint.io/troubleshooting/faqs/eslint/#i-get-errors-from-the-no-undef-rule-about-global-variables-not-being-defined-even-though-there-are-no-typescript-errors
			'no-undef': 'off'
		}
	},
	{
		files: ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],
		languageOptions: {
			parserOptions: {
				projectService: true,
				extraFileExtensions: ['.svelte'],
				parser: ts.parser
			}
		}
	},
	{
		// Override or add rule settings here, such as:
		// 'svelte/button-has-type': 'error'
		rules: {}
	},
	{
		// These files render <a href> to EXTERNAL, runtime-dynamic URLs (a grabbed
		// chart's source page). resolve() only applies to in-app routes, and the
		// rule can't statically prove a dynamic href is external, so it's disabled
		// here. Do not add app-internal navigation to these files without resolve().
		files: ['src/routes/(app)/add/+page.svelte', 'src/routes/(app)/add/GrabInput.svelte'],
		rules: {
			'svelte/no-navigation-without-resolve': 'off'
		}
	}
);
