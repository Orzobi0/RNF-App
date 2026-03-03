import { FONT_FAMILY } from '@/components/chartElements/chartTheme';

export const getRowMetrics = ({
  graphBottomY,
  isFullScreen,
  rowsZoneHeight,
  textRowHeight,
  showRelationsRow,
}) => {
  const rowsTopY = graphBottomY;
  const obsRowIndex = isFullScreen ? 9 : 7.5;
  const halfBlock = isFullScreen ? 1 : 0.75;
  const baseRowCount = obsRowIndex + halfBlock;
  const autoRowH = Math.max(1, Math.floor(rowsZoneHeight / baseRowCount));
  const rowH = Math.max(textRowHeight, autoRowH);

  const dateRowY = rowsTopY + rowH * 1;
  const cycleDayRowY = rowsTopY + rowH * 2;
  const symbolRowYBase = rowsTopY + rowH * 3;
  const mucusSensationRowY = rowsTopY + rowH * (isFullScreen ? 5 : 4.5);
  const mucusAppearanceRowY = rowsTopY + rowH * (isFullScreen ? 7 : 6);
  const observationsRowY = rowsTopY + rowH * (isFullScreen ? 9 : 7.5);
  const relationsRowY = showRelationsRow
    ? observationsRowY + rowH * (isFullScreen ? 2 : 1.5)
    : null;

  return {
    rowsTopY,
    obsRowIndex,
    halfBlock,
    baseRowCount,
    autoRowH,
    rowH,
    dateRowY,
    cycleDayRowY,
    symbolRowYBase,
    mucusSensationRowY,
    mucusAppearanceRowY,
    observationsRowY,
    relationsRowY,
  };
};

const buildFontString = (fontSize, fontWeight, fontFamily = FONT_FAMILY) =>
  `${fontWeight} ${fontSize}px ${fontFamily}`;

const createFallbackMeasure = () => (text, font) => {
  const match = /(\d+(?:\.\d+)?)px/.exec(font || '');
  const fontSize = match ? Number(match[1]) : 12;
  return String(text || '').length * fontSize * 0.6;
};

export const getLabelStep = ({
  totalPoints,
  getX,
  responsiveFontSize,
  data,
  measureTextWidth,
  fontFamily = FONT_FAMILY,
}) => {
  if (totalPoints < 2) return 1;
  const dayWidth = Math.abs(getX(1) - getX(0));
  if (!Number.isFinite(dayWidth) || dayWidth <= 0) return 1;
  const samplePoint = data?.find((entry) => entry?.date || entry?.cycleDay != null) ?? {};
  const compactDate = (dateStr) => {
    if (!dateStr) return '00/00';
    const [d, m] = String(dateStr).split('/');
    return `${parseInt(d, 10)}/${parseInt(m, 10)}`;
  };

  const measure = measureTextWidth || createFallbackMeasure();
  const sampleDate = compactDate(samplePoint?.date);
  const sampleDay = String(samplePoint?.cycleDay ?? totalPoints ?? '');
  const dateWidth = measure(sampleDate, buildFontString(responsiveFontSize(1.05), 900, fontFamily));
  const dayWidthText = measure(sampleDay, buildFontString(responsiveFontSize(1), 900, fontFamily));
  const minLabelWidth = Math.max(dateWidth, dayWidthText) + responsiveFontSize(0.8);

  return Math.max(1, Math.ceil(minLabelWidth / dayWidth));
};
