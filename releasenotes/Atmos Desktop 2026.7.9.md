## New Features
- **Terminal Caching Strategy**: Implemented a comprehensive terminal caching strategy. This includes panel-based cache limits, a new settings UI for configuring the cache, and a maximum terminal count eviction policy to ensure efficient resource management. ([#153](https://github.com/AruNi-01/atmos/pull/153))
- **Enhanced Code Review**: Updated the web interface for an improved code review experience, including enhancements to the code review context, diff viewer, and pull request panel.

## Bug Fixes
- **Terminal Stability**: Resolved several issues related to terminal caching, including cache eviction bugs, HMR memory leaks, and a React reconciliation issue. Ensure previous context tabs are properly preserved during cache transitions. ([#153](https://github.com/AruNi-01/atmos/pull/153))

## Improvements
- **API Concurrency**: The API now handles WebSocket messages concurrently to prevent head-of-line blocking, significantly improving responsiveness and message throughput.
- **Scanner Optimizations**: Optimized the local services scanner with concurrency and caching support. Also fixed a footer retry storm issue.
- **Engine Reliability**: Added timeout limits for `git` and `gh` CLI executions in the core engine to ensure operations fail fast and maintain predictable performance.

## Other Changes
- Addressed code review feedback and fixed spec review violations in `TEST.md` and `TECH.md` related to the terminal caching implementation. ([#153](https://github.com/AruNi-01/atmos/pull/153))
