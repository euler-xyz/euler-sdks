# Node + TypeScript Boilerplate

## Scripts
- `npm install` to install dev dependencies.
- `npm run dev` to run with `ts-node-dev` and auto-reload.
- `npm run build` to compile to `dist/`.
- `npm start` to run the built output.
- `npm run typecheck` for type-only validation.

## Project Layout
- `src/index.ts` entry point and exported API (`createGreeting`, `main`).
- `tsconfig.json` targets modern Node (ESM with NodeNext resolution).
- `dist/` is emitted on build and ignored from version control.

## Notes
- Package uses `"type": "module"` for ESM; adjust `tsconfig.json` if you prefer CJS.
- Add your own dependencies, tests, and tooling as needed.
- Publishable artifact lives in `dist/` with `main`, `types`, and `exports` configured.

