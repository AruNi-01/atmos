# Security Review Checklist

> **⚠️ CRITICAL: Before reporting ANY security finding, you MUST:**
> 1. **Trace the complete data flow** - Do not look at isolated code snippets
> 2. **Check if validation exists elsewhere** - Middleware, DTOs, ORM, database constraints
> 3. **Verify the threat is real** - Is this user-controlled? Is it accessible?
> 4. **Search for mitigations** - Search to find related validation/auth code
> 5. **Understand the architecture** - Where are auth checks performed in this project?
>
> **DO NOT report "missing auth" if:**
> - Auth is handled by middleware (check for `middleware`, `guards`, `auth` files)
> - The endpoint is protected by framework/route-level configuration
> - You haven't searched for where auth is implemented
>
> **DO NOT report "missing validation" if:**
> - Validation is done at the DTO/schema layer
> - Database constraints provide the validation
> - The input comes from a trusted source (e.g., database, not user)

---

## Input/Output Safety

### Injection Attacks
- **XSS (Cross-Site Scripting)**: Unsafe HTML injection, `dangerouslySetInnerHTML`, `v-html`, unescaped templates, `innerHTML` assignments
- **SQL Injection**: String concatenation in SQL queries, template literals with user input
- **NoSQL Injection**: Unvalidated MongoDB operators (`$gt`, `$ne`) from user input
- **Command Injection**: User input in shell commands (`exec`, `system`, `spawn`)
- **GraphQL Injection**: Unbounded queries, field injection, introspection enabled in production
- **LDAP Injection**: Unsanitized input in LDAP queries
- **Template Injection**: User input rendered in server-side templates (SSTI)

### Path & URL Safety
- **Path Traversal**: User input in file paths without sanitization (`../` attacks)
- **SSRF**: User-controlled URLs reaching internal services without allowlist validation
- **Open Redirect**: User-controlled redirect URLs without validation
- **Prototype Pollution**: Unsafe object merging in JavaScript (`Object.assign`, spread with user input)

## Authentication & Authorization

### AuthN
- [ ] Authentication required on non-public endpoints
- [ ] Login endpoints have rate limiting / brute force protection
- [ ] Password requirements are enforced (length, complexity)
- [ ] Multi-factor authentication available for sensitive operations
- [ ] Session fixation prevented (regenerate session on login)
- [ ] Logout properly invalidates session/token

### AuthZ
- [ ] Authorization checks before every data access
- [ ] No Insecure Direct Object Reference (IDOR) — validate ownership
- [ ] No reliance on client-provided roles/flags/IDs
- [ ] Admin/privileged endpoints have proper RBAC
- [ ] Tenant isolation enforced (no cross-tenant data leakage)
- [ ] Horizontal privilege escalation tested (user A accessing user B's data)

### JWT & Token Security
- [ ] Algorithm confusion prevented (reject `none`, validate expected algorithm)
- [ ] Strong, unique signing secrets (not hardcoded)
- [ ] Expiration (`exp`) is set and validated
- [ ] Sensitive data not stored in JWT payload (tokens are base64, not encrypted)
- [ ] Issuer (`iss`) and audience (`aud`) validated
- [ ] Refresh token rotation implemented
- [ ] Token revocation mechanism exists

## Secrets & Sensitive Data

### Secret Management
- [ ] No API keys, tokens, or credentials in source code
- [ ] No secrets in git history
- [ ] Environment variables not exposed to client-side code
- [ ] `.env` files are in `.gitignore`
- [ ] Production secrets use a secrets manager (Vault, AWS Secrets Manager, etc.)

### Data Protection
- [ ] Passwords hashed with modern algorithms (bcrypt, argon2, scrypt — never MD5/SHA1)
- [ ] Sensitive data encrypted at rest
- [ ] HTTPS enforced for all sensitive data transmission
- [ ] PII handled according to regulations (GDPR, CCPA)
- [ ] Logs do not contain passwords, tokens, or PII
- [ ] Error messages do not leak internal details (stack traces, SQL, file paths)

## HTTP Security

### CORS
- [ ] Not using `Access-Control-Allow-Origin: *` with credentials
- [ ] Allowed origins are explicitly listed (no wildcards in production)
- [ ] Preflight requests handled correctly

### Headers
- [ ] `Content-Security-Policy` (CSP) configured
- [ ] `X-Frame-Options: DENY` or `SAMEORIGIN`
- [ ] `X-Content-Type-Options: nosniff`
- [ ] `Strict-Transport-Security` (HSTS) enabled
- [ ] `Referrer-Policy` set appropriately

### CSRF
- [ ] CSRF tokens for state-changing operations (POST, PUT, DELETE)
- [ ] SameSite cookie attribute set to `Strict` or `Lax`
- [ ] API endpoints validate Origin/Referer headers

## Runtime Risks

### Resource Exhaustion
- [ ] Rate limiting on public-facing endpoints
- [ ] Request size limits configured
- [ ] File upload size limits enforced
- [ ] No unbounded loops or recursive calls
- [ ] Timeout configured for external HTTP/DB calls
- [ ] Connection pool limits in place
- [ ] Memory-bounded data structures (no unbounded caches/arrays)
- [ ] ReDoS prevention (no complex regex on user input, consider timeout)

### Blocking Operations
- [ ] No synchronous I/O in async/event-loop context
- [ ] CPU-intensive operations offloaded (worker threads, background jobs)
- [ ] Streaming used for large file processing

## Cryptography
- [ ] Strong algorithms used (AES-256, SHA-256+, RSA-2048+, Ed25519)
- [ ] No weak algorithms (MD5, SHA1, DES, RC4 for security purposes)
- [ ] No hardcoded IVs, salts, or nonces
- [ ] Encryption with authentication (GCM mode, not ECB)
- [ ] Sufficient key length
- [ ] CSPRNG used for random value generation

## Race Conditions

### Shared State Access
- [ ] Concurrent access to shared variables is synchronized
- [ ] Global state/singletons protected from concurrent modification
- [ ] Lazy initialization uses proper locking
- [ ] Thread-safe collections used in concurrent context

### Check-Then-Act (TOCTOU)
```
// ❌ Dangerous patterns:

if not exists(key):       # TOCTOU
    create(key)

value = get(key)          # Read-modify-write
value += 1
set(key, value)

if user.balance >= amount:  # Check-then-act
    user.balance -= amount
```

- [ ] File existence check followed by operation is atomic
- [ ] Balance checks use database-level atomic operations
- [ ] Permission checks cannot be invalidated between check and action

### Database Concurrency
- [ ] Optimistic locking used where appropriate (`version` column)
- [ ] `SELECT FOR UPDATE` used for critical read-modify-write
- [ ] Counter increments atomic (`UPDATE SET count = count + 1`)
- [ ] Unique constraint violations handled in concurrent inserts
- [ ] Transaction isolation level appropriate for use case

## Supply Chain & Dependencies
- [ ] Dependencies pinned to specific versions (lock file committed)
- [ ] No dependency confusion risk (private package name collision)
- [ ] External resources loaded with integrity checks (SRI for CDNs)
- [ ] Outdated dependencies with known CVEs identified
- [ ] Minimal dependency footprint (no unnecessary packages)

## Data Integrity
- [ ] Transactions encompass related state changes
- [ ] Partial write scenarios handled
- [ ] Retryable operations are idempotent
- [ ] Lost updates prevented (concurrent modifications handled)
- [ ] Cascading effects considered (deleting parent records)

## Questions to Ask
- "What happens if two requests hit this code simultaneously?"
- "Is this operation atomic or can it be interrupted?"
- "What shared state does this code access?"
- "Can a non-authenticated user reach this code path?"
- "What data would be exposed if this endpoint had a bug?"
- "Is user input being included in any query, command, or template?"
