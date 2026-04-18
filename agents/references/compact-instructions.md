# Compact Instructions

When compressing context, create a continuation-oriented coding handoff summary, not a generic conversation recap.

## Preserve With Highest Priority

- Task goal and success criteria
- User requirements, constraints, and preferences
- Important historical decisions that are still binding
- Implementation progress: done / in progress / pending
- Relevant files, classes, functions, APIs, and configs
- Completed changes and why they were made
- Blockers, bugs, failing tests, and debugging conclusions
- Rejected approaches that should not be retried

## Remove Or Strongly Compress

- Filler
- Repetition
- Low-value conversational back-and-forth
- Exploratory reasoning that did not affect the final implementation direction

## Rules

- Prefer final decisions over tentative discussion
- Preserve information needed to continue coding safely
- Explicitly mark uncertainty instead of inventing certainty
- Keep the summary compact but not lossy

## Output Sections

1. Task goal
2. Current progress
3. Completed work
4. Key decisions
5. Constraints
6. Open issues
7. Next steps
8. Relevant files/symbols
