# Logging System Overview

This project implements a robust, high-performance logging architecture designed for observability, traceability, and operational analytics. The logging system is highly configurable and supports multiple loggers, batching, context injection, performance monitoring, and file persistence.

---
## Core Components

### 1. **Logger (`src/utils/logger.ts`)**
- Central class for structured logging with configurable levels (`DEBUG`, `INFO`, `WARN`, `ERROR`, `SILENT`).
- Supports enabling/disabling colors, timestamps, categories, and progress logs.
- Implements correlation IDs for tracing requests across systems.
- Optimized for performance with fast path checks, caching, and batching.
- Exposes singleton and category-specific loggers (`streamLogger`, `endpointLogger`, etc.).
- Specialized methods for streaming, endpoint, model, and memory logs.

### 2. **AsyncLogger (`src/utils/asyncLogger.ts`)**
- Wraps BatchLogger for asynchronous, high-throughput logging.
- Uses a promise-based queue to avoid blocking, with queue overflow protection.
- Tracks performance metrics (log times, queue overflows, async operations).
- Supports context-rich log entries (correlationId, requestId, user/session metadata).
- Exposes global and configurable instances.

### 3. **BatchLogger (`src/utils/batchLogger.ts`)**
- Handles batch writing of log entries to console and (optionally) log files.
- Configurable batch size, buffer limits, flush interval, async/sync flush, and compression.
- Rotates log files daily and tracks retention.
- Monitors metrics (entries, batches, flush times, buffer utilization, write errors).
- Handles buffer overflows by forced flush or dropping oldest entries.

### 4. **ContextualLogger (`src/utils/contextualLogger.ts`)**
- Wraps Logger for automatic context injection (correlationId, userId, streamId, etc.).
- Enables structured logging for requests, streaming, and authentication events.
- Performance logging with automatic timing and context.
- Facilitates contextual traceability across distributed operations.

### 5. **PerformanceLogger (`src/utils/performanceLogger.ts`)**
- Aggregates metrics for operations, requests per second, response times, and memory usage.
- Leverages AsyncLogger for efficient performance event logging.
- Supports sampling, memory optimization, percentile calculations, and periodic cleanup.
- Exposes dashboards and helpers for instrumentation and reporting.

---
## Configuration

- All logging options are managed centrally via `src/config/index.ts` and exposed as the `config.logging` object.
- Configuration is loaded from environment variables and validated using schemas.
- Supports overrides for development, production, and test environments.
- Main options include:
  - `level`: Log verbosity (`debug`, `info`, `warn`, `error`, `silent`)
  - `enableColors`, `enableTimestamps`, `enableCategories`
  - Progress, endpoint, model, memory logs
  - Batching frequency, chunk log frequency

---
## Usage Patterns

- All loggers expose structured methods: `debug`, `info`, `warn`, `error`.
- Correlation IDs can be set for distributed tracing.
- ContextualLogger and category-specific loggers inject context automatically.
- BatchLogger and AsyncLogger are used for high-volume, latency-sensitive scenarios.
- PerformanceLogger provides instrumentation for code paths and dashboard reporting.

**Example (from unit tests):**
```ts
const logger = new Logger({ level: LogLevel.DEBUG })
logger.info("API", "Request succeeded", { id: 123, user: "alice" })
logger.setCorrelationId("req-456")
logger.warn("STREAM", "Slow stream detected")
```

---
## Extensibility & Integration

- Loggers are pluggable and can be instantiated with custom configs.
- Middleware and services can inject contextual loggers for request-scoped logging.
- File logging and metrics can be enabled for production diagnostics.
- Supports structured logging for authentication, streaming, endpoints, and memory events.

---
## Test Coverage

- Logging is thoroughly unit tested (`tests/unit/logger.test.ts`) for:
  - Log level filtering
  - Message formatting
  - Correlation ID propagation
  - Specialized logging methods
  - Batching and cleanup

---
## Performance & Reliability

- Designed for minimal overhead in production, with adaptive batching and async I/O.
- Queue and buffer overflows are handled gracefully, with error and warning logs.
- All loggers expose metrics for monitoring and diagnostics.
- Log files are rotated, compressed (optional), and retained per config.

---
## Best Practices

- Use contextual loggers for request/operation-level traceability.
- Configure log level and batching appropriately for production versus development.
- Monitor logger and batch metrics for system health and performance.
- Leverage PerformanceLogger for instrumentation and dashboarding.

---
## Security & Compliance

- No sensitive values are logged; configuration logging excludes secrets.
- All log writing is performed with error handling and fallback to console.

---
## Reference

- **Logger:** `src/utils/logger.ts`
- **AsyncLogger:** `src/utils/asyncLogger.ts`
- **BatchLogger:** `src/utils/batchLogger.ts`
- **ContextualLogger:** `src/utils/contextualLogger.ts`
- **PerformanceLogger:** `src/utils/performanceLogger.ts`
- **Configuration:** `src/config/index.ts`
- **Unit Tests:** `tests/unit/logger.test.ts`

---
