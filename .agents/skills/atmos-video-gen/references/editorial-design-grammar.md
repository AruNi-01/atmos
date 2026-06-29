# Editorial Design Grammar

Read this whenever an Atmos video needs creative direction, storyboard work, reference-video translation, or a fix for a video that feels generic, dull, underdesigned, or too much like a slideshow.

## Reference Video Translation

When the user supplies a reference video, inspect it before designing:

```bash
ffprobe -v error -show_entries format=duration,size \
  -show_entries stream=index,codec_name,codec_type,width,height,r_frame_rate,sample_rate,channels \
  -of default=nw=1 path/to/reference-video

mkdir -p /tmp/atmos-reference-frames
ffmpeg -hide_banner -nostats -i path/to/reference-video \
  -vf "fps=1,scale=960:-1" /tmp/atmos-reference-frames/frame-%04d.jpg -y

ffmpeg -hide_banner -nostats -i path/to/reference-video \
  -vf "fps=1/2,scale=480:-1,tile=5x6" \
  -frames:v 1 -update 1 /tmp/atmos-reference-contact-sheet-000.jpg -y
```

For videos longer than about one minute, create additional contact sheets with `-ss 60`, `-ss 120`, and so on so the CTA and late-act rhythm are inspected too.

Study the contact sheets and several individual frames. Extract the design grammar, not the brand. Do not copy the reference product name, mascot, exact wording, color marks, or shot order.

Useful observations to capture:

- Act structure: how the video opens, where proof begins, where chapter breaks happen, and how the CTA resolves.
- Frame families: title card, product proof, split workflow, phone insert, chat surface, calendar/notification, logo/agent wall, CTA.
- Proof density: how many seconds pass before real UI appears, and how often product states reappear.
- Typography: headline length, weight, italic use, whitespace, caption placement, and contrast.
- Motion grammar: hard cuts, masked wipes, zooms, pans, focus pulls, scene contrast, staggered reveals, and transitions between light and dark stages.
- Asset handling: whether screenshots are full-frame proof, cropped inspection, background texture, or picture-in-picture.

## Design Standard

Treat a marketing video as an edited product film, not as a sequence of decorative cards. The viewer should see enough real UI and workflow evidence to understand the promise even with the sound muted.

Strong Atmos videos should have three visible layers:

- Narrative layer: short headlines or act cards that explain the problem and position Atmos.
- Proof layer: real screens, terminal/worktree states, agent chips, review views, browser windows, chat apps, mobile notifications, and generated outputs.
- Rhythm layer: captions, camera moves, cuts, and small overlays that make the video feel intentionally edited.

Minimal does not mean empty. Use negative space to make proof readable, not to avoid showing product.

## Storyboard Requirements

Before coding the HyperFrames composition, write a storyboard table in `DESIGN.md`:

```text
| Time | Role | Visual proof | Headline/caption | Motion | Source asset |
|------|------|--------------|------------------|--------|--------------|
| 0.0-2.0 | Hook | None / brand type only | "Ship with agents" | Type scale-in, quick cut | Generated text |
| 2.0-5.0 | Proof | Workspace with parallel agents | "One workspace, many agents" | Slow crop pan over UI | source/workspace.png |
```

Use this table to prevent repetitive scenes. Adjacent beats should not use the same frame family and entrance motion unless the repetition is a deliberate montage.

Beat-count baseline:

- 15-20 seconds: 4-6 beats.
- 25-35 seconds: 6-9 beats.
- 60-110 seconds: 14-24 beats with 3-5 chapter breaks.

Avoid scenes longer than 6 seconds unless they are genuine live product demonstrations with evolving UI.

## Frame Families

Use a varied mix of these frame families.

**Hook Typography**

Large 2-6 word statements, high contrast, strong whitespace, and one clear motion gesture. Use this to create stakes, not to explain every feature.

**Dark Chapter Card**

Black or graphite stage, centered title, subtle texture or thin motion lines, and small act/context labels. Use for reset points between proof sequences.

**Product Proof Stage**

A real screenshot, browser window, terminal, review view, or desktop capture on a clean light stage. Preserve original colors. Use scale, crop, and pan to direct attention.

**Split Workflow**

Two to four panels showing before/after, input/output, agent assignment, or parallel work. Keep panel geometry stable and let motion reveal relationships.

**Phone or Notification Insert**

A mobile lock screen, notification, calendar, or chat moment that proves Atmos can act while the user is away. Use sparingly so it feels like a story beat, not stock filler.

**Agent Surface**

Agent chips, icons, or logos arranged with enough density to show breadth. Prefer real current icons. Do not imply support is limited to only the few shown.

**Lottie Insert**

A short vector animation used as a precise accent inside the edit: logo lockup, icon swarm, diagram trace, metric beat, lower third, or CTA punctuation. Use this to sharpen a moment that benefits from reusable vector motion, not to replace product proof with abstract decoration.

**CTA Frame**

Return to a calm, bright layout. Show the Atmos name, one concise positioning line, `https://atmos.land`, the GitHub link for public promos, and two small proof panels if space allows.

## HyperFrames Implementation Patterns

These effects are practical in HyperFrames with regular HTML/CSS/React motion:

- Use `transform: translate3d(...) scale(...) rotateX(...) rotateY(...)` for camera moves and subtle 3D tilts.
- Use `clip-path`, overflow-hidden wrappers, or mask divs for wipes and crop reveals.
- Use opacity plus blur only as a transition helper; do not make blurred screenshots the main proof.
- Build reusable local components such as `CaptionPill`, `ChapterCard`, `ProductStage`, `SplitWorkflow`, `AgentMatrix`, and `PhoneInsert` when a project repeats a frame family.
- Use a verified Lottie insert when logo, type, icon, counter, or diagram motion needs to stay crisp and reusable. Keep it short, transparent by default, and composited around real proof rather than replacing it.
- Keep screenshots in `object-fit: contain` or carefully controlled crops so UI remains inspectable.
- Use shadows and borders lightly to separate product captures from the stage; do not turn every screen into a glossy glass card.
- Add small, timed overlays for callouts, counters, status pills, or cursor focus, but avoid noisy particles and decorative motion unrelated to the product story.

## Quality Check

Before the final render, make a 1fps contact sheet of the generated video and inspect it as a sequence. Revise if any of these are true:

- More than two adjacent frames use the same layout and motion idea.
- Product UI is absent for a long stretch in a product-led promo.
- Screenshots are too small, blurred, desaturated, or cropped so tightly that the proof is unclear.
- Lottie appears as ambient decoration for too long, obscures the product, or becomes the whole point of the scene without carrying real story/proof value.
- The video could be described as "text cards over a gradient" or "a generic AI reel."
- The CTA appears without enough preceding proof.
- The palette collapses into all graphite, all purple-blue, muddy amber/brown, or grayscale.
