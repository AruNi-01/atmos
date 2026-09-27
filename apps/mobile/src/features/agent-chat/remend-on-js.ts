import remend, { type RemendOptions } from "remend";

const defaultRemendConfig: RemendOptions = {
  bold: true,
  italic: true,
  boldItalic: true,
  strikethrough: true,
  links: true,
  linkMode: "text-only",
  images: true,
  inlineCode: true,
  katex: false,
  setextHeadings: true,
};

/**
 * Streamdown runs remend on a worklet runtime. That call throws because remend's
 * default export is a plain function, and worklets cannot invoke it synchronously.
 * Finish incomplete markdown on the JS thread instead.
 */
export function processRemendInWorklet(
  markdown: string,
  onComplete: (result: string) => void,
  config?: RemendOptions,
) {
  const mergedConfig = config ? { ...defaultRemendConfig, ...config } : defaultRemendConfig;
  onComplete(remend(markdown, mergedConfig));
}
