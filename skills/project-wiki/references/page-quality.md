# Page Quality Standard

The purpose of every wiki page is to help a developer understand **how something works, why it was designed this way, and how to work with it**. A page that only lists what exists is not a wiki page — it is an index.

## A page is good when:

- it answers the questions in its page plan with enough depth that a reader learns how the code works, not just what classes exist
- it explains **mechanisms** (how does the request flow? how does the config get loaded? how do these classes collaborate?) rather than just naming components
- it explains **rationale** (why is this split into two services? why does this use async events instead of direct calls?) when the code structure reveals design intent
- its important claims are supportable from `sources` and `evidence_refs`
- its evidence bundle has non-empty `files` traceable to `_ast/hierarchy.json`
- its frontmatter `sources` are a subset of its evidence `files`
- it does not duplicate another page without a reason
- its structure fits the topic instead of a global template
- it includes concrete code references (class names, method signatures, file paths) as anchors for its explanations

## A page is weak when:

- it describes what exists without explaining how it works or why it is structured that way
- it reads like a file listing with one-sentence annotations
- it exists mainly to satisfy word-count or heading-count requirements
- it talks around the code without using the page evidence bundle
- it repeats generic architecture boilerplate that could apply to any Spring Boot / Node.js / etc. project
- it makes assertions about flow or dependency structure without evidence
- its evidence bundle is empty or contains only placeholder entries
- it references classes or files in prose (backtick-quoted) that do not appear in its evidence bundle

## Research quality audit

Each `_research/*.md` file must include an `## Investigation Log` section at the end that lists:
- which AST shard files were actually opened and read
- which source files were opened when AST was insufficient
- what was discovered from each file

If a research report's investigation log shows fewer than 5 distinct files examined, the research is likely too shallow to support good wiki pages. The evidence curator should flag this and deepen the investigation before assembling evidence bundles.
