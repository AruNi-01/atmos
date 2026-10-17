/** How long each composer capture step stays on screen before the next one. */
export const PARITY_COMPOSER_STEP_MS = 800;

export const PARITY_COMPOSER_STEP_IDS = [
  "idle",
  "multiline",
  "busy",
  "suggestions",
  "keyboard",
] as const;

export type ParityComposerStepId = (typeof PARITY_COMPOSER_STEP_IDS)[number];

export type ParityComposerSuggestion = {
  id: string;
  title: string;
  detail: string;
};

export type ParityComposerStep = {
  id: ParityComposerStepId;
  atMs: number;
  text: string;
  busy: boolean;
  followUp: boolean;
  focus: boolean;
  suggestionTitle?: string;
  suggestions: ParityComposerSuggestion[] | null;
};

const SUGGESTIONS: ParityComposerSuggestion[] = [
  { id: "plan", title: "/plan", detail: "Plan the change" },
  { id: "review", title: "/review", detail: "Review the diff" },
];

/**
 * Capture-only composer frames. Keyboard focus is last so the software
 * keyboard cannot cover the earlier shots. This is a TextInput focus call,
 * not a Simulator tap.
 */
export function parityComposerSteps(): ParityComposerStep[] {
  return [
    {
      id: "idle",
      atMs: 0,
      text: "",
      busy: false,
      followUp: false,
      focus: false,
      suggestions: null,
    },
    {
      id: "multiline",
      atMs: PARITY_COMPOSER_STEP_MS,
      text: "Check the release notes\nThen the table\nThen the code block",
      busy: false,
      followUp: false,
      focus: false,
      suggestions: null,
    },
    {
      id: "busy",
      atMs: PARITY_COMPOSER_STEP_MS * 2,
      text: "Keep going on the same turn",
      busy: true,
      followUp: true,
      focus: false,
      suggestions: null,
    },
    {
      id: "suggestions",
      atMs: PARITY_COMPOSER_STEP_MS * 3,
      text: "/",
      busy: false,
      followUp: false,
      focus: false,
      suggestionTitle: "Commands",
      suggestions: SUGGESTIONS,
    },
    {
      id: "keyboard",
      atMs: PARITY_COMPOSER_STEP_MS * 4,
      text: "Hello",
      busy: false,
      followUp: false,
      focus: true,
      suggestions: null,
    },
  ];
}

export function parityComposerStepAt(elapsed: number): ParityComposerStep {
  const steps = parityComposerSteps();
  let current = steps[0];
  if (!current) {
    throw new Error("composer capture steps are empty");
  }
  for (const step of steps) {
    if (elapsed >= step.atMs) current = step;
  }
  return current;
}

export function parityComposerShotName(id: ParityComposerStepId): string {
  return `composer-${id}`;
}
