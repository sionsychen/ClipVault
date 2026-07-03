export function computeThumbDimensions(srcW, srcH, maxDim) {
  if (!srcW || !srcH) return { width: 0, height: 0 };
  if (srcW <= maxDim && srcH <= maxDim) return { width: srcW, height: srcH };
  const scale = maxDim / Math.max(srcW, srcH);
  return { width: Math.round(srcW * scale), height: Math.round(srcH * scale) };
}
