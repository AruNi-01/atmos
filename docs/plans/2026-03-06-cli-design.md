# Atmos CLI Design

**Date**: 2026-03-06
**Status**: Draft

## Overview

The `atmos` CLI is a comprehensive developer tool combining project management, development workflow, and AI agent interaction. Built with Rust and clap, it uses direct library calls to `core-service` for optimal performance without requiring a running API server.

### Key Design Decisions

| Aspect | Choice | Rationale |
|--------|--------|-----------|
| Framework | clap with derive macros | Type-safe, maintainable, most popular |
| Backend Integration | Direct `core-service` calls | No HTTP overhead, standalone operation |
| Output Format | JSON by default | Scriptable, pipe-friendly, parseable |
| Authentication | `ATMOS_TOKEN` environment variable | 12-factor app principles, secure |
| Command Syntax | Flat + nested aliases | Convenience + discoverability |

## Command Structure

### Project Management (`atmos project` / `atmos`)
- `init [name]` - Initialize new Atmos project
- `status` - Show current project status
- `config set/get/list` - Manage project configuration

### Development Workflow (`atmos dev` / `atmos`)
- `build` - Build the project
- `test` - Run tests
- `run [command]` - Run development server
- `clean` - Clean build artifacts

### Agent Interaction (`atmos agent` / `atmos`)
- `chat <prompt>` - Send prompt to agent
- `list` - List available agents
- `logs [agent-id]` - View agent execution logs
- `cancel [agent-id]` - Cancel running agent

### Alias Examples
```bash
atmos init                    # atmos project init
atmos build                   # atmos dev build
atmos chat "fix this bug"     # atmos agent chat
```

## Implementation Architecture

### Project Structure
```
apps/cli/
├── Cargo.toml
├── src/
│   ├── main.rs              # Entry point, command registration
│   ├── commands/
│   │   ├── mod.rs
│   │   ├── project.rs       # Project management
│   │   ├── dev.rs           # Development workflow
│   │   └── agent.rs         # Agent interaction
│   ├── config.rs            # Configuration
│   ├── output.rs            # JSON formatting
│   └── error.rs             # Error types
└── tests/                   # Integration tests
```

### Core Abstractions
```rust
trait Command {
    async fn execute(&self, ctx: &Context) -> Result<Output>;
}
```

## Data Flow

```
User Input → clap Parser → Command → Service Layer → Response → JSON Output
```

### Example: `atmos project init my-app`
1. clap parses to `ProjectInitCommand { name: "my-app" }`
2. Command calls `project_service.create_project(name)`
3. Service returns `Project { id, name, status }`
4. Output serializes to:
   ```json
   {"success":true,"data":{"id":"proj_123","name":"my-app","status":"initialized"}}
   ```

### Error Response Format
```json
{"success":false,"error":{"code":"E123","message":"Description"}}
```

## Testing Strategy

### Unit Tests
- Mock `core-service` traits
- Test parsing, validation, output formatting

### Integration Tests
- Real `core-service` with fixtures
- Verify JSON structure and error codes

### Manual Verification
```bash
# Basic functionality
atmos init test-project && echo "✓ Init works"
atmos build | jq .success && echo "✓ Build works"

# Error handling
atmos init "" | jq .error.code && echo "✓ Validation works"

# Alias equivalence
atmos build | jq -S . > /tmp/flat.json
atmos dev build | jq -S . > /tmp/nested.json
diff /tmp/flat.json /tmp/nested.json && echo "✓ Aliases work"
```
