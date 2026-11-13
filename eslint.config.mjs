import js from '@eslint/js'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['out/', 'dist/', 'node_modules/', 'coverage/'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // core/ must stay framework-free: no UI or Electron imports (ADR 0002).
    files: ['src/core/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: ['electron', 'react', 'react-dom', '**/renderer/**', '**/main/**'] },
      ],
    },
  },
)
