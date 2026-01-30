# Testing Patterns

**Analysis Date:** 2026-01-30

## Test Framework

**Runner:**
- **Frontend:** Bun test runner (via `bun test`)
  - Config: Not detected (using Bun defaults)
  - Run commands: `bun test` or `just test-web` (line 114)
- **Backend:** Cargo test runner (built-in)
  - Config: None (using standard Rust `cargo test`)
  - Run commands: `cargo test --workspace` or `just test-rust` (line 118)

**Assertion Library:**
- **Frontend:** Bun built-in assertions
- **Backend:** Standard Rust assertions (`assert!`, `assert_eq!`)

**Run Commands:**
```bash
# All tests
just test                    # Run both frontend and backend tests
bun test                     # Frontend only
cargo test --workspace       # Backend only

# Specific crate
cargo test --package api     # API tests (just test-api, line 122)

# With coverage
cargo tarpaulin --workspace --out Html    # Coverage report (line 127)
```

## Test File Organization

**Location:**
- **Frontend:** No dedicated test directory detected (tests likely co-located or in `__tests__` directories)
- **Backend:** Inline tests in source files using `#[cfg(test)]` modules

**Naming:**
- **Frontend:** Pattern not observed (no test files found in project source)
- **Backend:** `tests` module or inline test functions

**Structure:**
```
crates/
└── crate-name/
    └── src/
        ├── lib.rs
        └── module.rs
            # Contains:
            # - Production code
            # - #[cfg(test)] mod tests { ... }
```

## Test Structure

**Rust Test Pattern:**
```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_terminal_service_creation() {
        let service = TerminalService::new();
        assert_eq!(service.session_count().await, 0);
    }

    #[test]
    fn test_tmux_check() {
        let service = TerminalService::new();
        let available = service.is_tmux_available();
        println!("tmux available: {}", available);
    }
}
```

**Patterns:**
- **Setup:** Create test instances in test functions or use `Default` trait
- **Teardown:** Rust's drop mechanism handles cleanup automatically
- **Assertion:** `assert!`, `assert_eq!`, `assert_ne!` macros

**Async Testing:**
```rust
#[tokio::test]
async fn test_async_operation() {
    // Async test code
    let result = some_async_function().await;
    assert_eq!(result, expected);
}
```

## Mocking

**Framework:**
- **Frontend:** Not detected (no test files observed)
- **Backend:** Manual mocking or trait-based mocking

**Patterns:**
- Use trait objects for dependency injection
- Create mock implementations for testing
- Example not observed in codebase but recommended pattern:

```rust
#[async_trait]
pub trait WsMessageHandler: Send + Sync {
    async fn handle_message(&self, conn_id: &str, message: &str) -> Option<String>;
}

// Mock for testing
struct MockHandler {
    responses: HashMap<String, String>,
}

#[async_trait]
impl WsMessageHandler for MockHandler {
    async fn handle_message(&self, conn_id: &str, message: &str) -> Option<String> {
        self.responses.get(message).cloned()
    }
}
```

**What to Mock:**
- External dependencies (file system, network)
- Database operations
- WebSocket connections
- PTY/Terminal operations

**What NOT to Mock:**
- Pure functions
- Data structures
- Simple business logic

## Fixtures and Factories

**Test Data:**
- No dedicated fixture system detected
- Test data created inline in test functions
- Consider implementing fixture pattern for complex data:

```rust
// Recommended pattern (not currently in codebase)
struct TestFixture {
    db: DatabaseConnection,
    service: WorkspaceService,
}

impl TestFixture {
    async fn setup() -> Self {
        let db = setup_test_db().await;
        let service = WorkspaceService::new(db.clone());
        Self { db, service }
    }

    async fn teardown(self) {
        self.db.cleanup().await;
    }
}
```

**Location:**
- Inline in test functions
- Consider `fixtures.rs` module for shared test data

## Coverage

**Requirements:** None enforced (no coverage thresholds detected)

**View Coverage:**
```bash
# Generate HTML coverage report
just test-coverage           # Runs tarpaulin (line 126-127)
cargo tarpaulin --workspace --out Html
```

**Current State:**
- Test coverage appears minimal based on:
  - Few test files detected
  - Only inline tests observed
  - Large production modules without corresponding tests

## Test Types

**Unit Tests:**
- **Frontend:** Not observed
- **Backend:** Inline unit tests in `#[cfg(test)]` modules
- **Scope:** Individual functions, struct methods
- **Approach:** Isolated function testing with assertions

**Integration Tests:**
- **Frontend:** Not detected
- **Backend:** Not detected (no `tests/` directory at crate root)
- **Scope:** Multiple components working together
- **Approach:** Would test service + database, WebSocket handlers, etc.

**E2E Tests:**
- **Framework:** Not used
- **Tools:** None detected (no Playwright, Cypress, or similar)
- **Scope:** Full application workflows
- **Status:** Not implemented

## Common Patterns

**Async Testing (Rust):**
```rust
#[tokio::test]
async fn test_async_function() {
    let result = async_function().await;
    assert_eq!(result, expected_value);
}
```

**Error Testing:**
```rust
#[test]
fn test_error_case() {
    let result = function_that_fails();
    assert!(result.is_err());
    assert_eq!(result.unwrap_err(), ExpectedError);
}
```

**State Testing:**
```rust
#[tokio::test]
async fn test_state_changes() {
    let service = TerminalService::new();
    assert_eq!(service.session_count().await, 0);

    // Create session
    service.create_session(/* ... */).await;
    assert_eq!(service.session_count().await, 1);

    // Cleanup
    service.destroy_session("id").await;
    assert_eq!(service.session_count().await, 0);
}
```

## Testing Gaps

**Untested Areas:**
- **Frontend:** No test coverage detected
  - Components: No test files for React components
  - Hooks: No test files for custom hooks
  - API clients: No tests for WebSocket communication
  - State management: No tests for Zustand stores

- **Backend:** Minimal coverage
  - Only inline tests observed in `crates/core-service/src/service/terminal.rs`
  - No tests for:
    - WebSocket message handling
    - Database repositories
    - Git operations
    - File system operations
    - Project/Workspace services

**Risk:**
- Business logic changes could break without detection
- WebSocket protocol changes untested
- Database migrations untested
- Git workflow logic untested

**Priority:** High

## Recommendations

**For New Tests:**

1. **Backend Testing:**
   - Add `tests/` directory at crate root for integration tests
   - Test service layer with mock repositories
   - Test repository layer with test database
   - Test WebSocket handlers with mock connections
   - Use `tokio::test` for async operations

2. **Frontend Testing:**
   - Set up a test framework (Vitest or Jest)
   - Test custom hooks with `@testing-library/react-hooks`
   - Test components with `@testing-library/react`
   - Mock WebSocket communication for integration tests
   - Test Zustand store state changes

3. **Coverage Goals:**
   - Aim for 80%+ coverage on critical paths
   - Prioritize business logic over UI components
   - Test error paths and edge cases

4. **Test Organization:**
   - Co-locate tests with code (Rust inline modules)
   - Create `__tests__` directories for complex modules
   - Use descriptive test names: `test_what_expectation`

## CI/CD Integration

**Current:**
- Justfile provides `just ci` command (line 185)
- Runs: lint → test → build
- No automated coverage reporting detected

**Commands:**
```bash
just ci              # Full CI pipeline
just pre-commit      # Pre-commit checks (line 189)
```

---

*Testing analysis: 2026-01-30*
