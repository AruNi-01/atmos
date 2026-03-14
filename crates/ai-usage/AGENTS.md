# AI Usage Tracking - AGENTS.md

> **📊 AI Usage Analytics**: Tracks and reports AI usage across multiple AI coding platforms.

---

## Build And Test

- **Build**: `cargo build -p ai-usage`
- **Test**: `cargo test -p ai-usage` or `just test-rust`
- **Lint**: `cargo clippy -p ai-usage`

---

## 📁 Directory Structure

```
crates/ai-usage/
└── src/
    ├── lib.rs              # Public exports
    ├── models.rs           # Data models
    ├── service.rs          # Usage tracking service
    ├── config.rs           # Configuration
    ├── constants.rs        # Provider constants
    ├── runtime.rs          # Runtime utilities
    └── providers/          # Platform-specific providers
        ├── mod.rs          # Provider factory
        ├── claude.rs       # Anthropic Claude
        ├── cursor.rs       # Cursor AI
        ├── codex.rs        # Codex
        ├── gemini.rs       # Google Gemini
        ├── kimi.rs         # Moonshot Kimi
        ├── minimax.rs      # MiniMax
        ├── opencode.rs     # OpenCode
        ├── zai.rs          # Zai
        ├── antigravity.rs  # Antigravity
        ├── amp.rs          # AMP
        └── factory/        # Provider factory
            ├── mod.rs       # Factory exports
            ├── session.rs   # Session management
            └── storage.rs   # Storage backend
```

---

## Coding Conventions

### Provider Pattern
- Each AI platform has a dedicated provider in `providers/`
- Providers implement a common trait/interface for usage extraction
- Factory pattern in `providers/factory/` for provider instantiation

### Storage
- Usage data stored locally with encrypted credentials
- Each provider may have different storage locations and formats

### Service Layer
- `service.rs` provides unified access to all providers
- Use async/await for I/O operations

---

## Safety Rails

### NEVER
- Hardcode API keys or credentials — use encrypted storage
- Assume all providers have the same data format — each is unique
- Expose provider-specific details outside this crate — keep abstracted

### ALWAYS
- Handle provider errors gracefully (missing config, permissions, etc.)
- Respect platform-specific security requirements
- Keep provider implementations isolated and modular
- Use the factory pattern for provider instantiation

---

## Compact Instructions

Preserve when compressing:
1. Provider pattern: One file per AI platform in `providers/`
2. Factory pattern for instantiation (`providers/factory/`)
3. Service layer (`service.rs`) provides unified API
4. Encrypted credential storage (never hardcode keys)
