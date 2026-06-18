import { clamp01, parseRgba, rgbaWithAlpha } from './canvasUtils';

export const drawInterpretationBands = ({
  ctx,
  theme,
  snap,
  dpr,
  graphBottomY,
  areaH,
  showInterpretation,
  opacity = 1,
  interpretationSegments,
  bandPaintCache,
}) => {
  if (!showInterpretation || !Array.isArray(interpretationSegments)) return;

  const bandH = Math.max(areaH * 0.5, 0);
  if (bandH <= 0) return;

  const bandY = graphBottomY - bandH;
  const getKey = (kind) => `${kind}:${Math.round(bandY * dpr)}:${Math.round(bandH * dpr)}:${dpr}`;

  const resolveBaseColor = (segment) => {
    if (segment.phase === 'fertile') return theme.interpretation.fertile;
    if (segment.phase === 'relativeInfertile') return theme.interpretation.relativeInfertile;
    if (segment.phase === 'postOvulatory' && segment.status === 'absolute') {
      return theme.interpretation.postOvulatoryAbsolute;
    }
    if (segment.phase === 'postOvulatory') return theme.interpretation.postOvulatory;
    return theme.interpretation.default;
  };

  const getPaint = (kind, baseColor) => {
    const key = getKey(kind);
    const cached = bandPaintCache?.get(key);
    if (cached) return cached;

    const parsed = parseRgba(baseColor);
    const baseA = parsed ? clamp01(parsed.a) : 0.22;
    const fill = ctx.createLinearGradient(0, bandY, 0, graphBottomY);
    fill.addColorStop(0.0, rgbaWithAlpha(baseColor, baseA * 0.08));
    fill.addColorStop(0.55, rgbaWithAlpha(baseColor, baseA * 0.55));
    fill.addColorStop(1.0, rgbaWithAlpha(baseColor, baseA));

    const gloss = ctx.createLinearGradient(0, bandY, 0, bandY + bandH);
    gloss.addColorStop(0.0, 'rgba(255,255,255,0.18)');
    gloss.addColorStop(0.35, 'rgba(255,255,255,0.06)');
    gloss.addColorStop(1.0, 'rgba(255,255,255,0.0)');

    const out = { fill, gloss };
    bandPaintCache?.set(key, out);
    return out;
  };

  interpretationSegments.forEach((segment) => {
    const x = segment?.bounds?.x;
    const w = segment?.bounds?.width;
    if (!Number.isFinite(x) || !Number.isFinite(w) || w <= 0) return;

    const kind =
      segment.phase === 'postOvulatory'
        ? (segment.status === 'absolute' ? 'postAbs' : 'post')
        : segment.phase || 'default';
    const paint = getPaint(kind, resolveBaseColor(segment));
    const sx = snap(x);
    const sy = snap(bandY);
    const sw = snap(w);
    const sh = snap(bandH);

    ctx.save();
    ctx.globalAlpha *= opacity;
    ctx.fillStyle = paint.fill;
    ctx.fillRect(sx, sy, sw, sh);
    ctx.fillStyle = paint.gloss;
    ctx.fillRect(sx, sy, sw, sh);
    ctx.restore();
  });
};
