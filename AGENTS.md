# AGENTS.md

## Build, Lint, and Test Commands

- **Build:** `bun build src/index.ts --outdir dist --target bun`
- **Start (dev):** `bun run --watch src/index.ts`

- **Type Check:** `tsc --noEmit`
- **Lint:** _No explicit lint script; use TypeScript strictness and formatting guidelines below._
- **Test all:** `bun test`
- **Test unit:** `bun test tests/unit/`
- **Test integration:** `bun run tests/integration/run-integration-tests.ts`
- **Test security:** `bun run tests/security/run-security-tests.ts`
- **Test single file:** `bun test <path/to/testfile>`
- **Test with coverage:** `bun test --coverage`
- **Python tests:** `python scripts/tests/test.py` (streaming), `python scripts/performance-test.py` (performance)

## Code Style Guidelines

- **Imports:** Use ES module syntax (`import { ... } from "..."`). Group external imports first, then internal.
- **Formatting:** 2 spaces per indent. Prefer trailing commas in multiline objects/arrays. Use semicolons.
- **Types:** Use TypeScript types and interfaces for all function signatures, parameters, and return values. Prefer explicit types.
- **Naming:** Use camelCase for variables/functions, PascalCase for types/classes, UPPER_SNAKE_CASE for constants.
- **Error Handling:** Use strongly typed error interfaces (see `src/types/errors.ts`). Always return OpenAI-compatible error responses for API errors.
- **Logging:** Use the provided `Logger` class. Include correlation IDs for request tracking. Log at appropriate levels (DEBUG, INFO, WARN, ERROR).
- **Validation:** Use Zod schemas for runtime validation of inputs and errors.
- **Tests:** Use Bun’s test runner. Mock external dependencies. Restore global state after each test.
- **Configuration:** Store secrets and config in `.env.*` files. Validate config before starting server.
- **Comments:** Use JSDoc for public APIs and complex logic.
- **File Structure:** Keep middleware, utils, types, and config in their respective folders. Tests should mirror source structure.
