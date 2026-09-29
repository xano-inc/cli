import {includeIgnoreFile} from '@eslint/compat'
import oclif from 'eslint-config-oclif'
import prettier from 'eslint-config-prettier'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

const gitignorePath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '.gitignore')

export default [
  includeIgnoreFile(gitignorePath),
  ...oclif,
  prettier,
  {
    // Project-specific overrides. The stock oclif preset was never tuned to this
    // repo's documented conventions, which left `npm test` permanently red (its
    // `posttest` hook runs lint). Each rule below is relaxed because the rule
    // contradicts a deliberate, documented choice — not to paper over a defect.
    rules: {
      // Real debt worth paying down, but these sit on untyped Metadata API
      // payloads. Retyping them is a typing project, not a lint pass — kept
      // visible as warnings rather than silently switched off.
      '@typescript-eslint/no-explicit-any': 'warn',

      // Identifiers here are snake_case on purpose, and it is load-bearing:
      //   - CLAUDE.md mandates underscores for all identifiers.
      //   - Command flags/args ARE the public CLI surface: `--per_page`,
      //     `--tenant_name`, `--include_draft`. Renaming them to satisfy a
      //     linter would be a breaking change for every user and script.
      //   - Xano's Metadata API and ~/.xano/credentials.yaml are snake_case on
      //     the wire (`access_token`, `instance_origin`, `obj_name`), and we
      //     model those payloads verbatim.
      camelcase: 'off',

      // This is a CLI. Exiting with a chosen status code is the whole contract
      // of a command runner, and the test-runner commands depend on honest exit
      // codes. unicorn's own message even carves out "CLI apps".
      'n/no-process-exit': 'off',

      // `fetch`, `Response` and `FormData` are globals from Node 18 on. The rule
      // only flags them as "experimental until 21". This package targets Node 20
      // LTS (`engines.node: >=20.12.0`) and is built on fetch throughout;
      // raising engines to 21 to satisfy the linter would drop LTS users.
      'n/no-unsupported-features/node-builtins': ['error', {ignores: ['fetch', 'FormData', 'Response']}],

      // TypeScript's own checker resolves identifiers, and it runs in `build`.
      // ESLint's no-undef doesn't understand ambient DOM/undici types, so it
      // false-positives on `RequestInit` and friends. Disabling it on TS is the
      // typescript-eslint project's own recommendation.
      'no-undef': 'off',

      'unicorn/no-process-exit': 'off',
    },
  },
]
