# TEST · SECURITY-001: Unify Next.js 16.4.1

> Test Plan · verify the monorepo Next.js security bump. References TECH SECURITY-001.

## Strategy

Manifest + lockfile checks and CI. No new product E2E.

| ID  | Check                                                                             |
| --- | --------------------------------------------------------------------------------- |
| S1  | Root catalog.next and overrides.next are `16.4.1`                                 |
| S2  | apps/docs, apps/web, apps/landing (and any other next consumers) declare `16.4.1` |
| S3  | No workspace package.json still pins `16.3.8` for next                            |
| S4  | bun.lock resolves next to 16.4.1 for those workspaces                             |
| S5  | CI required checks pass on the PR                                                 |
| S6  | #367 superseded/closed with link to this PR                                       |
