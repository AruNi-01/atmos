---
page_id: runtime-flow
title: Runtime Flow
kind: workflow
audience: contributor
sources:
  - apps/api/src/main.rs
  - crates/core-service/src/service/ws_message.rs
evidence_refs:
  - _evidence/runtime-flow.json
updated_at: 2026-04-22T12:00:00Z
---

# Runtime Flow

This page explains how runtime control moves from bootstrap into the main service layer. It is scoped to the backend runtime path and intentionally skips unrelated UI details.

## Entry

The runtime starts in the API bootstrap layer and hands off to service orchestration after initialization work finishes.

## Dispatch

The core dispatch path is shaped by the message service. The important point is not the exact function list, but the service boundary where transport-specific input becomes domain work.

## Evidence Notes

The main claims in this page are grounded in the source files listed in `sources` and the matching evidence bundle.
