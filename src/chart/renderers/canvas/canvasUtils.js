export const SENSATION_COLOR = 'var(--color-sensacion-fuerte)';
export const APPEARANCE_COLOR = 'var(--color-apariencia-fuerte)';
export const OBSERVATION_COLOR = 'var(--color-observaciones-fuerte)';
export const HEART_COLOR = '#D85C70';
export const POST_PEAK_MARKER_COLOR = '#7A3A48';
export const PEAK_MARKER_COLOR = '#D85C70';
export const HIGH_SEQUENCE_NUMBER_COLOR = '#B94A5E';
export const BASELINE_NUMBER_COLOR = '#337C8B';
export const TODAY_HIGHLIGHT_COLOR = '#B94A5E';
export const SYMBOL_BORDER_FALLBACK = 'rgba(216,92,112,0.24)';
export const DEFAULT_TEXT_FONT_FAMILY =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

export const compactDate = (dateStr) => {
  if (!dateStr) return '';
  const [d, m] = String(dateStr).split('/');
  return `${parseInt(d, 10)}/${parseInt(m, 10)}`;
};

export const limitWords = (str = '', maxWords, fallback = '-') => {
  if (!str) return fallback;
  return String(str).split(/\s+/).slice(0, maxWords).join(' ');
};

export const buildFontString = (fontSize, fontWeight = 700) =>
  `${fontWeight} ${fontSize}px ${DEFAULT_TEXT_FONT_FAMILY}`;

export const splitTextLinesByWidth = (
  str = '',
  { maxWidth, maxLines = 3, fontSize, fontWeight = 700, fallback = '-', measureTextWidth }
) => {
  if (!str) return [fallback, ...Array.from({ length: Math.max(0, maxLines - 1) }, () => '')];

  const font = buildFontString(fontSize, fontWeight);
  const textWidth = (text) => measureTextWidth(text, font);
  const normalized = String(str).trim();
  const hasSpaces = /\s/.test(normalized);
  const tokens = hasSpaces ? normalized.split(/\s+/) : Array.from(normalized);
  const separator = hasSpaces ? ' ' : '';
  const lines = [];

  const splitByChars = (value) => {
    const chars = Array.from(value);
    let line = '';
    while (chars.length) {
      const candidate = line + chars[0];
      if (textWidth(candidate) <= maxWidth || !line) {
        line = candidate;
        chars.shift();
      } else {
        break;
      }
    }
    return [line, chars.join('')];
  };

  while (tokens.length && lines.length < maxLines) {
    let line = '';
    while (tokens.length) {
      const nextToken = tokens[0];
      const candidate = line ? `${line}${separator}${nextToken}` : nextToken;
      if (textWidth(candidate) <= maxWidth) {
        line = candidate;
        tokens.shift();
        continue;
      }
      if (!line) {
        const [chunk, remainder] = splitByChars(nextToken);
        line = chunk;
        if (remainder) tokens[0] = remainder;
        else tokens.shift();
      }
      break;
    }
    lines.push(line);
  }

  if (tokens.length && lines.length) {
    const lastIndex = lines.length - 1;
    let lastLine = lines[lastIndex] || '';
    while (lastLine && textWidth(`${lastLine}...`) > maxWidth) {
      lastLine = lastLine.slice(0, -1);
    }
    lines[lastIndex] = lastLine ? `${lastLine}...` : '...';
  }

  while (lines.length < maxLines) lines.push('');
  return lines;
};

export const parseDash = (dash) => {
  if (!dash) return [];
  if (Array.isArray(dash)) return dash;
  return String(dash)
    .split(/[ ,]+/)
    .map((item) => Number(item))
    .filter((item) => Number.isFinite(item) && item > 0);
};

export const clamp01 = (value) => Math.max(0, Math.min(1, value));

export const parseRgba = (color) => {
  if (!color) return null;
  const value = String(color).trim();
  const rgbMatch = value.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i);
  if (rgbMatch) {
    return {
      r: Number(rgbMatch[1]),
      g: Number(rgbMatch[2]),
      b: Number(rgbMatch[3]),
      a: rgbMatch[4] == null ? 1 : Number(rgbMatch[4]),
    };
  }

  const hex = value.match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    const n = parseInt(hex[1], 16);
    return {
      r: (n >> 16) & 255,
      g: (n >> 8) & 255,
      b: n & 255,
      a: 1,
    };
  }

  return null;
};

export const rgbaWithAlpha = (color, alpha) => {
  const parsed = parseRgba(color);
  if (!parsed) return color;
  return `rgba(${parsed.r},${parsed.g},${parsed.b},${clamp01(alpha)})`;
};

export const createSnap = (dpr) => (value) => Math.round(value * dpr) / dpr;

export const drawText = ({
  ctx,
  text,
  x,
  y,
  fontSize,
  weight = 700,
  color = '#64748b',
  align = 'center',
  baseline = 'middle',
  stroke = null,
  strokeWidth = 0,
}) => {
  if (text == null || text === '') return;
  ctx.save();
  ctx.font = buildFontString(fontSize, weight);
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  if (stroke && strokeWidth > 0) {
    ctx.lineJoin = 'round';
    ctx.strokeStyle = stroke;
    ctx.lineWidth = strokeWidth;
    ctx.strokeText(String(text), x, y);
  }
  ctx.fillStyle = color;
  ctx.fillText(String(text), x, y);
  ctx.restore();
};

export const drawRoundedRect = (ctx, x, y, width, height, radius) => {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
};

export const drawPeakCross = (ctx, x, y, arm, strokeWidth, outlineWidth) => {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(255,255,255,0.96)';
  ctx.lineWidth = outlineWidth;
  ctx.beginPath();
  ctx.moveTo(x - arm, y - arm);
  ctx.lineTo(x + arm, y + arm);
  ctx.moveTo(x + arm, y - arm);
  ctx.lineTo(x - arm, y + arm);
  ctx.stroke();
  ctx.strokeStyle = PEAK_MARKER_COLOR;
  ctx.lineWidth = strokeWidth;
  ctx.beginPath();
  ctx.moveTo(x - arm, y - arm);
  ctx.lineTo(x + arm, y + arm);
  ctx.moveTo(x + arm, y - arm);
  ctx.lineTo(x - arm, y + arm);
  ctx.stroke();
  ctx.restore();
};

export const drawHeart = (ctx, x, y, size) => {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 24, size / 24);
  ctx.beginPath();
  ctx.moveTo(12, 21);
  ctx.bezierCurveTo(8, 17.5, 3, 14.5, 3, 9);
  ctx.bezierCurveTo(3, 5.8, 5.5, 4, 8.1, 4);
  ctx.bezierCurveTo(9.8, 4, 11.1, 4.9, 12, 6.1);
  ctx.bezierCurveTo(12.9, 4.9, 14.2, 4, 15.9, 4);
  ctx.bezierCurveTo(18.5, 4, 21, 5.8, 21, 9);
  ctx.bezierCurveTo(21, 14.5, 16, 17.5, 12, 21);
  ctx.closePath();
  ctx.fillStyle = HEART_COLOR;
  ctx.fill();
  ctx.restore();
};

export const resolveCssColor = (color, fallback) => {
  if (!color || typeof window === 'undefined' || !String(color).startsWith('var(')) {
    return color || fallback;
  }
  const variableName = String(color).match(/var\(([^,)]+)/)?.[1]?.trim();
  if (!variableName) return fallback;
  return (
    window.getComputedStyle(document.documentElement).getPropertyValue(variableName).trim() ||
    fallback
  );
};

export const normalizeTemp2 = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Number(numeric.toFixed(2));
};
