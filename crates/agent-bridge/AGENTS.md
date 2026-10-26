# Agent Bridge crate

> Pure protocol for the agent↔agent directory/bus (APP-084). Not Relay. Not Canvas/PT Design tab dispatch.

## Owns

Envelope, address `{ server_id, provider_id, chat_id?, workspace_id? }`, busy policy, in-memory mailbox (no internal mutex), context bags, delivery plan, catalog DTOs.

## Does not own

HTTP, WebSocket, DB, `crates/agent` Chat hosts, Relay, CLI, MCP, a Web panel.

Orchestration (catalog gather, Chat inject, occupancy) lives in `core-service` `AgentBridgeService`.
