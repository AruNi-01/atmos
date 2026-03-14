# Token Usage Tracking - AGENTS.md

> **🔢 Token Counting**: Accurate token counting and usage tracking for LLM operations.

---

## Build And Test

- **Build**: `cargo build -p token-usage`
- **Test**: `cargo test -p token-usage` or `just test-rust`
- **Lint**: `cargo clippy -p token-usage`

---

## 📁 Directory Structure

```
crates/token-usage/
└── src/
    ├── lib.rs              # Public exports
    ├── models.rs           # Data models (TokenUsage, TokenCount, etc.)
    ├── service.rs          # Token counting service
    └── tests.rs            # Unit tests
```

---

## Coding Conventions

### Token Counting
- Uses `tokscale-core` vendor library for accurate token counting
- Supports multiple tokenization schemes (tiktoken, cl100k_base, etc.)

### Service Interface
```rust
pub use service::{
    TokenUsageService,      // Main service
    count_tokens,           // Utility function
    estimate_cost,          // Cost estimation
};

pub use models::{
    TokenUsage,             // Usage record
    TokenCount,             // Count result
    TokenCost,              // Cost calculation
};
```

### Integration
- Used by `core-service` for tracking token usage across operations
- Provides both synchronous and async interfaces

---

## Safety Rails

### NEVER
- Assume all text uses the same tokenization — different models use different schemes
- Count tokens naively by characters/words — use proper tokenization
- Expose tokscale-core internals — keep wrapped in service layer

### ALWAYS
- Use the correct tokenizer for each model (claude, gpt-4, etc.)
- Handle tokenization errors gracefully
- Maintain accuracy over performance when counting tokens
- Keep vendor dependency isolated in service layer

---

## Compact Instructions

Preserve when compressing:
1. Vendor dependency: `tokscale-core` for tokenization
2. Service pattern: `service.rs` provides all public APIs
3. Model-specific tokenizers (not one-size-fits-all)
4. Used by `core-service` for usage tracking
