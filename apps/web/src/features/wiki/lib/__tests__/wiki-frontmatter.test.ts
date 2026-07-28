import { describe, expect, it } from "bun:test";
import { parseFrontmatter } from "../wiki-utils";

describe("parseFrontmatter", () => {
  it("parses plain single-line fields", () => {
    const md = `---
title: Hello Wiki
level: beginner
reading_time: 5
---

# Body
`;
    const { frontmatter, body } = parseFrontmatter(md);
    expect(frontmatter.title).toBe("Hello Wiki");
    expect(frontmatter.level).toBe("beginner");
    expect(frontmatter.reading_time).toBe("5");
    expect(body).toContain("# Body");
  });

  it("parses folded block scalar title (>-)", () => {
    const md = `---
title: >-
  A multi-line wiki title
  that should fold into one line
section: getting-started
level: intermediate
---

# Content
`;
    const { frontmatter } = parseFrontmatter(md);
    expect(frontmatter.title).toBe(
      "A multi-line wiki title that should fold into one line",
    );
    expect(frontmatter.section).toBe("getting-started");
  });

  it("parses literal block scalar (|) keeping newlines", () => {
    const md = `---
title: |
  line one
  line two
level: advanced
---

body
`;
    const { frontmatter } = parseFrontmatter(md);
    expect(frontmatter.title).toBe("line one\nline two");
  });

  it("parses multi-line sources list", () => {
    const md = `---
title: Sources page
sources:
  - src/a.ts
  - src/b.ts
level: beginner
---

# Body
`;
    const { frontmatter } = parseFrontmatter(md);
    expect(frontmatter.sources).toEqual(["src/a.ts", "src/b.ts"]);
  });

  it("does not treat block indicator as the field value", () => {
    const md = `---
title: >-
  Real title text
---

body
`;
    const { frontmatter } = parseFrontmatter(md);
    expect(frontmatter.title).not.toBe(">-");
    expect(frontmatter.title).toBe("Real title text");
  });
});
