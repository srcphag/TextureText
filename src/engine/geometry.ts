// Cover-fit crop math shared by the preview and (later) the stage/luma grid.

export interface SourceRect {
  sx: number
  sy: number
  sw: number
  sh: number
}

/** Source rect to draw so the source covers dstW×dstH, centered, preserving aspect. */
export function coverFit(srcW: number, srcH: number, dstW: number, dstH: number): SourceRect {
  const srcAspect = srcW / srcH
  const dstAspect = dstW / dstH
  if (srcAspect > dstAspect) {
    // Source wider: crop left/right.
    const sw = srcH * dstAspect
    return { sx: (srcW - sw) / 2, sy: 0, sw, sh: srcH }
  }
  // Source taller (or equal): crop top/bottom.
  const sh = srcW / dstAspect
  return { sx: 0, sy: (srcH - sh) / 2, sw: srcW, sh }
}
