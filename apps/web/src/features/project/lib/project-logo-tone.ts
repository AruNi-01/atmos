export type ProjectLogoTone = "invert-light" | "invert-dark" | "unchanged";

const SAMPLE_SIZE = 64;
const ALPHA_MIN = 40;
const COLORFUL_CHROMA = 0.22;
const COLORFUL_FRACTION = 0.1;
const SILHOUETTE_COVERAGE_MAX = 0.82;
const CONTRAST_LUMA_STD = 55;
const LIGHT_MEAN_LUMA = 160;
const DARK_MEAN_LUMA = 110;

const toneCache = new Map<string, ProjectLogoTone>();

export function getCachedProjectLogoTone(src: string): ProjectLogoTone | undefined {
  return toneCache.get(src);
}

export function setCachedProjectLogoTone(src: string, tone: ProjectLogoTone): void {
  toneCache.set(src, tone);
}

export function clearProjectLogoToneCache(): void {
  toneCache.clear();
}

/**
 * Classify a rasterized logo so the sidebar can keep unknown marks visible
 * across light/dark themes without flattening colorful app icons.
 *
 * - Transparent monochrome marks invert against the mismatched theme.
 * - Filled plates with both light and dark pixels already contrast — leave them.
 * - Colorful artwork is left untouched.
 */
export function classifyProjectLogoPixels(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): ProjectLogoTone {
  const pixelCount = width * height;
  if (pixelCount <= 0 || data.length < pixelCount * 4) {
    return "unchanged";
  }

  let opaqueCount = 0;
  let colorfulCount = 0;
  let lumaSum = 0;
  let lumaSumSq = 0;

  for (let i = 0; i < pixelCount; i += 1) {
    const offset = i * 4;
    const alpha = data[offset + 3] ?? 0;
    if (alpha < ALPHA_MIN) {
      continue;
    }
    const r = data[offset] ?? 0;
    const g = data[offset + 1] ?? 0;
    const b = data[offset + 2] ?? 0;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const chroma = (max - min) / 255;
    if (chroma > COLORFUL_CHROMA) {
      colorfulCount += 1;
    }
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    lumaSum += luma;
    lumaSumSq += luma * luma;
    opaqueCount += 1;
  }

  if (opaqueCount < 12) {
    return "unchanged";
  }

  if (colorfulCount / opaqueCount > COLORFUL_FRACTION) {
    return "unchanged";
  }

  const meanLuma = lumaSum / opaqueCount;
  const variance = Math.max(0, lumaSumSq / opaqueCount - meanLuma * meanLuma);
  const lumaStd = Math.sqrt(variance);
  const coverage = opaqueCount / pixelCount;

  if (coverage <= SILHOUETTE_COVERAGE_MAX) {
    if (meanLuma >= LIGHT_MEAN_LUMA) {
      return "invert-light";
    }
    if (meanLuma <= DARK_MEAN_LUMA) {
      return "invert-dark";
    }
    return "unchanged";
  }

  if (lumaStd > CONTRAST_LUMA_STD) {
    return "unchanged";
  }

  if (meanLuma >= LIGHT_MEAN_LUMA) {
    return "invert-light";
  }
  if (meanLuma <= DARK_MEAN_LUMA) {
    return "invert-dark";
  }
  return "unchanged";
}

export function classifyProjectLogoImage(image: HTMLImageElement): ProjectLogoTone {
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  if (!sourceWidth || !sourceHeight || typeof document === "undefined") {
    return "unchanged";
  }

  try {
    const canvas = document.createElement("canvas");
    canvas.width = SAMPLE_SIZE;
    canvas.height = SAMPLE_SIZE;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) {
      return "unchanged";
    }
    context.clearRect(0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
    context.drawImage(image, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
    const { data } = context.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
    return classifyProjectLogoPixels(data, SAMPLE_SIZE, SAMPLE_SIZE);
  } catch {
    return "unchanged";
  }
}
