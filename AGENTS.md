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
- **Logging:**  
  - Uses a multi-layered system: `Logger` (core, structured, category-aware), `AsyncLogger` (high-performance queue, batch), `BatchLogger` (batch write to file/console), and specialized loggers for streaming, endpoints, models, and memory.
  - Supports log levels (DEBUG, INFO, WARN, ERROR, SILENT), batching, categories, timestamps, and correlation IDs for tracing requests.
  - All API/middleware/server components log system events, errors, streaming, endpoint discovery, resource usage, and performance metrics.
  - Configurable features control color, progress, endpoint/model/memory logs, batch size, and queue limits via `LoggerConfig`/`AsyncLoggerConfig`.
  - Log messages are written asynchronously/batched when enabled; fallback to console on failure.
  - Performance metrics and queue status can be monitored via the async/batch logger APIs.
  - Example usage:  
    ```ts
    import { logger } from "./utils/logger"
    logger.info("SERVER", "Server started")
    logger.warn("STREAM", "Stream timeout")
    logger.error("ENDPOINT", "Failed to reach endpoint", { url, error })
    ```
- **Validation:** Use Zod schemas for runtime validation of inputs and errors.
- **Tests:** Use Bun’s test runner. Mock external dependencies. Restore global state after each test.
- **Configuration:** Store secrets and config in `.env.*` files. Validate config before starting server.
- **Comments:** Use JSDoc for public APIs and complex logic.
- **File Structure:** Keep middleware, utils, types, and config in their respective folders. Tests should mirror source structure.
