# Product Documentation Principles For Atmos

Use these principles when writing or reviewing Atmos user documentation.

## 1. Help The User Succeed At A Task

Good product docs start from the user's job, not from the implementation. A page should quickly answer:

- What can I do?
- When should I use this?
- What are the steps?
- What should I expect after each important step?
- Where do I go if it fails?

Avoid pages that mainly describe how the code is organized. Internal architecture belongs in root `docs/` unless the detail changes a user's action.

## 2. Treat Shipped Behavior As The Contract

Docs should describe behavior that is available now. Use specs and release notes as leads, then verify with source code, UI labels, CLI help, or runtime behavior.

If a feature is planned but not shipped, do not present it as current documentation. Put it in a gap note or ask the user whether they want roadmap copy elsewhere.

## 3. Prefer Durable Pages Over Release Dumps

Release notes are time-based. User docs are task-based. After a release, fold the new behavior into the page where users will look six months later:

- new command -> CLI command page
- new workflow -> workflow page
- new capability -> feature page
- new failure mode -> troubleshooting/reference
- changed setup -> getting started or install/update page

Only create a new page when the concept is stable and important enough to navigate to directly.

## 4. Keep The Information Scent Strong

Titles, descriptions, headings, and sidebar labels should make the destination obvious. A user should not need to know Atmos internals to guess where to click.

Prefer nouns and user concepts over subsystem names. Use subsystem names only when users actually see them in the product or CLI.

## 5. Write For Scanning

Most users read docs while doing something else. Use:

- short opening paragraphs
- action-oriented headings
- numbered steps for ordered flows
- tables for command/task mappings
- bullets for options and tips
- cross-links instead of repeated background

Avoid long narrative sections before the first actionable step.

## 6. Keep English And Chinese Meaning-Aligned

The Chinese page should not be a literal word-by-word mirror, but it must carry the same product meaning, constraints, steps, warnings, and links.

Keep commands, flags, paths, URLs, product names, and technical identifiers stable. Translate the surrounding explanation naturally.

## 7. Be Honest About Preconditions And Limits

Call out prerequisites before steps that depend on them: installed CLI, configured runtime, authenticated GitHub, existing project settings, network access, or available local services.

Do not hide limitations. A clear limitation with a workaround is better than polished prose that sends the user into a broken path.

## 8. Make Verification Easy

Where possible, include a way for users to tell success from failure:

- command output shape
- UI state they should see
- file or workspace state that should exist
- next page or workflow to continue with

This is especially important for install, update, runtime, tunnel, CLI, and troubleshooting docs.

## 9. Avoid Stale Specifics

Use exact names when they are stable contracts: commands, flags, filenames, settings labels, and shortcuts.

Avoid fragile details that often drift: internal module names, private helper functions, one-off commit hashes, temporary UI copy, or exact implementation order.

## 10. Review Navigation As Part Of The Content

In Fumadocs, the sidebar is part of the documentation experience. Any new page must be discoverable and ordered intentionally in both locales.

For Atmos, always keep `meta.json` and `meta.zh.json` page arrays aligned by slug.
