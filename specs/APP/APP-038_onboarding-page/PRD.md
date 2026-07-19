# PRD · APP-038: Onboarding Page

## 1. Purpose & User Stories

### Target Audience
First-time developers launching Atmos web interface on their local machine.

### Use Case
1. Understand what Atmos is and why they should use it.
2. Verify their system has the necessary CLI utilities (`tmux`, `git`, `gh`) before using Atmos agents and terminals.
3. Import a workspace directory as their first project to get coding immediately.

### User Stories
- *As a new user*, I want a beautiful, welcoming intro screen when I open Atmos, so I understand the software's capabilities.
- *As a developer*, I want to know if my machine has `tmux`, `git`, and `gh` installed, and if not, see exactly how to install them, so I don't run into errors later.
- *As a developer*, I want to import my existing codebase as the first project easily without digging through complex settings first.

---

## 2. Requirements

### Must Haves
1. **Full-screen overlay**: Completely hides the main IDE shell during onboarding.
2. **Onboarding State Persistence**: Uses `localStorage` to check if the onboarding has been completed, showing it exactly once.
3. **Environment Audit**:
   - Checks if `tmux`, `git`, and `gh` are installed.
   - Provides clear CLI command templates (e.g. `brew install tmux git gh`) with copy buttons if missing.
   - Supports re-checking dependencies in real-time.
4. **First Project Setup**:
   - Allows typing or browsing directory path using the native Atmos file browser.
   - Validates project path structure.
   - Registers the project in the Atmos store.

### Nice to Haves
1. Fluent animations between onboarding steps.
2. Detection of default shell and path issues.

---

## 3. Scope & Exclusions
- Excludes setting up remote keys/relays (this remains in the hosted welcome setup gate).
- Excludes auto-installation via sudo.
