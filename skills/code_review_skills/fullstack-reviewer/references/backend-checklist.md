# Backend Review Checklist

## API Design

### Endpoint Design
- [ ] RESTful conventions followed (proper HTTP methods, status codes)
- [ ] URL naming is consistent (plural nouns, no verbs in path)
- [ ] Versioning strategy is applied (path-based or header-based)
- [ ] Pagination implemented for list endpoints
- [ ] Proper use of query params vs path params vs request body

### Request Validation
- [ ] All input validated on the server side (never trust client)
- [ ] Validation errors return clear, structured messages
- [ ] Request body has size limits
- [ ] File uploads are validated (type, size, count)
- [ ] Enum/option values are validated against allowed set

### Response Design
- [ ] Consistent response envelope (success/error structure)
- [ ] Error responses include actionable messages (no stack traces in production)
- [ ] Proper HTTP status codes (400 for validation, 401 for auth, 403 for permission, 404 for not found, 500 for internal)
- [ ] No sensitive data leaked in responses (passwords, tokens, internal IDs)
- [ ] Collection responses include pagination metadata

## Error Handling

### Anti-patterns to Flag
```
// ❌ Swallowed exception
try { ... } catch (e) { }

// ❌ Log and forget
try { ... } catch (e) { console.log(e) }

// ❌ Overly broad catch
try { ... } catch (Exception e) { return "error" }

// ❌ Rust: unwrap() in non-test code
let value = result.unwrap();  // Panics on error

// ❌ Go: ignored error
result, _ := doSomething()
```

### Best Practices
- [ ] Errors are caught at appropriate boundaries
- [ ] Error messages are user-friendly (no internal details exposed)
- [ ] Errors are logged with sufficient context for debugging
- [ ] Async errors are properly propagated or handled
- [ ] Fallback behavior is defined for recoverable errors
- [ ] Critical errors trigger alerts/monitoring
- [ ] Error types are specific and meaningful (not generic "something went wrong")

### Language-Specific Error Handling

#### Rust
- [ ] `unwrap()` / `expect()` only in tests or provably infallible cases
- [ ] Error types implement `std::error::Error`
- [ ] `?` operator used for propagation (not manual match)
- [ ] `thiserror` or `anyhow` used consistently
- [ ] Panic-free production code

#### Go
- [ ] Errors are never ignored (`_ = err`)
- [ ] Errors are wrapped with context (`fmt.Errorf("doing X: %w", err)`)
- [ ] Custom error types used for business logic
- [ ] `errors.Is()` / `errors.As()` used for comparison

#### TypeScript/Node.js
- [ ] Async/await errors caught properly (try-catch or .catch())
- [ ] No unhandled promise rejections
- [ ] Custom error classes extend Error
- [ ] Express/Koa error middleware configured

#### Python
- [ ] Specific exception types caught (not bare `except:`)
- [ ] Context managers used for resource cleanup
- [ ] Exceptions are logged before re-raising

#### Java
- [ ] Checked vs unchecked exceptions used appropriately
- [ ] Resources closed in finally/try-with-resources
- [ ] No empty catch blocks

## Database & Data Access

### Query Safety
- [ ] Parameterized queries used (no string concatenation for SQL)
- [ ] ORMs configured to prevent N+1 queries
- [ ] Index exists for commonly queried columns
- [ ] Migrations are reversible
- [ ] Transactions used for multi-step operations

### Performance
```
// ❌ N+1 query pattern
for item in items:
    author = db.query("SELECT * FROM authors WHERE id = ?", item.author_id)

// ✅ Batch query
author_ids = [item.author_id for item in items]
authors = db.query("SELECT * FROM authors WHERE id IN (?)", author_ids)
```

- [ ] `SELECT *` avoided — only fetch needed columns
- [ ] No unbounded queries (always LIMIT)
- [ ] Connection pooling configured
- [ ] Slow query logging enabled
- [ ] Bulk operations used for batch inserts/updates
- [ ] Indexes reviewed for new queries

### Data Integrity
- [ ] Unique constraints where needed
- [ ] Foreign key constraints in place
- [ ] Cascading deletes handled intentionally
- [ ] Soft delete vs hard delete strategy is consistent
- [ ] Timestamps populated automatically (created_at, updated_at)

## Concurrency & Async

### Thread Safety
- [ ] Shared mutable state protected by locks/mutexes
- [ ] No race conditions in check-then-act patterns
- [ ] Concurrent data structures used where appropriate
- [ ] Deadlock potential analyzed (lock ordering)

### Async Safety
- [ ] Async tasks have proper error handling
- [ ] Cancellation is handled safely
- [ ] No blocking calls in async context
- [ ] Background jobs have timeout limits
- [ ] Queue processing is idempotent

### Rust Specific
- [ ] `.await` does not hold `MutexGuard` across yield points
- [ ] `tokio::spawn` errors are handled (not just logged)
- [ ] `Send + Sync` constraints are satisfied
- [ ] No unnecessary `.clone()` to satisfy borrow checker

### Go Specific
- [ ] Goroutines have lifecycle management (context cancellation)
- [ ] Channels have proper close semantics
- [ ] `sync.WaitGroup` or `errgroup` used for goroutine coordination
- [ ] Race conditions checked with `go test -race`

## Authentication & Authorization
- [ ] New endpoints have auth guards
- [ ] RBAC/ABAC checks before data access
- [ ] No security through obscurity (hidden URLs are not auth)
- [ ] Token validation includes expiry, issuer, audience checks
- [ ] Password hashing uses modern algorithms (bcrypt, argon2)
- [ ] Session management is secure (httpOnly, secure flags)
- [ ] Rate limiting on auth endpoints (login, register, password reset)

## Configuration & Environment
- [ ] Secrets not hardcoded (use environment variables or secret manager)
- [ ] Config files do not contain production secrets
- [ ] Default configs are secure (no debug mode, no wildcard CORS)
- [ ] Environment-specific configs properly separated (dev/staging/prod)

## Logging & Observability
- [ ] Structured logging used (JSON format, not plain text)
- [ ] Log levels are appropriate (debug, info, warn, error)
- [ ] Sensitive data not logged (passwords, tokens, PII)
- [ ] Request/response logging has correlation IDs
- [ ] Performance metrics measured for critical paths

## Questions to Ask
- "What happens if the database is down?"
- "What happens if two requests hit this endpoint simultaneously?"
- "Is this operation idempotent?"
- "What's the worst case time complexity?"
- "How does this scale to 100x current load?"
- "Can a user access someone else's data through this endpoint?"
