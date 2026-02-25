# Backend Review Checklist

Applies to: `.rs`, `.go`, `.py`, `.java`, `.kt`, `.rb`, `.php`, `.cs`, and server-side `.ts`/`.js`

## Error Handling

- [ ] All errors are propagated or explicitly handled — no silent swallows (`let _ = op()`, bare `except: pass`)
- [ ] Error messages include enough context for debugging (file, operation, input that caused it)
- [ ] Errors returned to clients do not leak internal stack traces or sensitive details
- [ ] Panic / crash paths (`.unwrap()`, `raise`, `throw`) are justified or replaced with graceful handling in production code

## API Design

- [ ] HTTP status codes are semantically correct (404 for not found, 422 for validation, 409 for conflict)
- [ ] Request validation happens before business logic
- [ ] Responses have consistent shape — errors follow the same envelope as successes
- [ ] Pagination applied to list endpoints (no unbounded queries)
- [ ] Breaking changes to existing endpoints are versioned or flagged

## Security

- [ ] **SQL injection**: all queries use parameterized statements / ORM — no string interpolation into SQL
- [ ] **Authentication**: protected routes verify token/session before any logic runs
- [ ] **Authorization**: resource ownership checked (not just "is logged in", but "owns this resource")
- [ ] **File paths**: user-supplied paths are canonicalized and confined to allowed directories
- [ ] **Secrets**: no hardcoded API keys, passwords, or tokens — use env vars
- [ ] **Rate limiting**: sensitive endpoints (login, password reset) have rate limiting
- [ ] **CORS**: origins are explicitly allowlisted, not `*` in production

## Database

- [ ] No N+1 queries — use joins, batch fetches, or eager loading
- [ ] Transactions used for multi-step writes that must be atomic
- [ ] Indexes exist for columns used in `WHERE`, `ORDER BY`, `JOIN` conditions on large tables
- [ ] Migrations are reversible (have a `down` path)
- [ ] No unbounded `SELECT *` on large tables in hot paths

## Concurrency & Async

- [ ] Shared mutable state is properly synchronized (mutex, channel, atomic)
- [ ] No lock held across I/O or `await` (deadlock risk)
- [ ] Background tasks have error handling and don't silently die
- [ ] Timeouts set on external calls (HTTP, DB, queue)

## Observability

- [ ] New code paths have appropriate log statements (info for normal flow, warn/error for anomalies)
- [ ] Logs do not contain PII or secrets
- [ ] Critical operations emit metrics or structured events where applicable

## SOLID / Design

| Smell | Signal |
|-------|--------|
| God class / service | One file handles HTTP + DB + domain + notifications |
| Feature envy | Method uses more data from another module than its own |
| Shotgun surgery | One logical change requires edits across 5+ files |
| Hardcoded dependencies | `new ConcreteService()` inside business logic instead of injection |
| Long method | Function > 40 lines with multiple levels of nesting |

## Language-Specific Quick Checks

**Rust**: `.unwrap()` in non-test code, holding `Mutex` across `.await`, missing `?` propagation  
**Go**: unchecked `error` returns, goroutine leak (no `defer cancel()`), `interface{}` overuse  
**Python**: mutable default arguments (`def f(x=[])`), bare `except`, blocking I/O in async context  
**Node.js**: unhandled promise rejections, `req.body` used without validation, synchronous `fs` in request handler  
**Java/Kotlin**: `NullPointerException` risk without null checks, unclosed resources without try-with-resources  
