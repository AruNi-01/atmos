# LLM Integration - AGENTS.md

> **🧠 LLM Client Abstraction**: Unified interface for interacting with various LLM providers.

---

## Build And Test

- **Build**: `cargo build -p llm`
- **Test**: `cargo test -p llm` or `just test-rust`
- **Lint**: `cargo clippy -p llm`

---

## 📁 Directory Structure

```
crates/llm/
└── src/
    ├── lib.rs              # Public exports
    ├── client.rs           # Main LLM client trait
    ├── config.rs           # LLM configuration
    ├── error.rs            # Error types
    ├── types.rs            # Common types (Message, Completion, etc.)
    ├── prompt_template.rs  # Prompt templating
    └── providers/          # Provider implementations
        ├── mod.rs          # Provider exports
        ├── openai_compatible.rs       # OpenAI-compatible APIs
        └── anthropic_compatible.rs    # Anthropic-compatible APIs
```

---

## Coding Conventions

### Provider Pattern
- Each provider implements a common `LLMClient` trait
- Providers are split into compatibility classes (OpenAI-compatible, Anthropic-compatible)
- New providers should follow the compatibility pattern

### Client Interface
```rust
pub use client::LLMClient;       // Main trait

pub use types::{
    Message,                     // Chat message
    Role,                        // (system, user, assistant)
    CompletionRequest,           // Request body
    CompletionResponse,          // Response body
    StreamChunk,                 // Streaming response
};

pub use providers::{
    OpenAICompatibleClient,      // OpenAI-compatible
    AnthropicCompatibleClient,   // Anthropic-compatible
};
```

### Configuration
- API keys and endpoints configured via `config.rs`
- Supports both streaming and non-streaming modes
- Prompt templating via `prompt_template.rs`

---

## Safety Rails

### NEVER
- Hardcode API keys — use configuration
- Assume all providers have the same API — use trait abstraction
- Expose provider-specific types outside the provider module
- Mix OpenAI and Anthropic message formats without conversion

### ALWAYS
- Use the `LLMClient` trait for all LLM interactions
- Convert provider-specific types to common types in `types.rs`
- Handle streaming and non-streaming consistently
- Add new providers under `providers/` following existing patterns

