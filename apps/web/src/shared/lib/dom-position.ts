export function clientPointToLocalElementPoint(
  element: HTMLElement | null,
  clientX: number,
  clientY: number,
) {
  if (!element) {
    return { x: clientX, y: clientY };
  }

  const rect = element.getBoundingClientRect();
  const layoutWidth = element.offsetWidth || rect.width || 1;
  const layoutHeight = element.offsetHeight || rect.height || 1;
  const scaleX = rect.width > 0 ? rect.width / layoutWidth : 1;
  const scaleY = rect.height > 0 ? rect.height / layoutHeight : 1;

  return {
    x: (clientX - rect.left) / scaleX,
    y: (clientY - rect.top) / scaleY,
  };
}
