import { isAfter, isSameDay, parseISO, startOfDay } from 'date-fns';
import { getSymbolAppearance, getSymbolColorPalette } from '@/config/fertilitySymbols';
import {
  APPEARANCE_COLOR,
  BASELINE_NUMBER_COLOR,
  HIGH_SEQUENCE_NUMBER_COLOR,
  OBSERVATION_COLOR,
  PEAK_MARKER_COLOR,
  POST_PEAK_MARKER_COLOR,
  SENSATION_COLOR,
  SYMBOL_BORDER_FALLBACK,
  TODAY_HIGHLIGHT_COLOR,
  buildFontString,
  compactDate,
  drawHeart,
  drawPeakCross,
  drawRoundedRect,
  drawText,
  limitWords,
  normalizeTemp2,
  resolveCssColor,
  splitTextLinesByWidth,
} from './canvasUtils';

const buildHighSequenceOrderMap = ({ showInterpretation, ovulationDetails, firstHighIndex, points }) => {
  if (!showInterpretation || !ovulationDetails?.confirmed) return new Map();
  const preferredIndices = Array.isArray(ovulationDetails?.sequenceDisplayIndices)
    ? ovulationDetails.sequenceDisplayIndices
    : null;
  const fallbackIndices = Array.isArray(ovulationDetails?.highSequenceIndices)
    ? ovulationDetails.highSequenceIndices
    : [];
  const firstHighIdx = Number(firstHighIndex);
  const hasFirstHigh = Number.isInteger(firstHighIdx);
  const map = new Map();
  (preferredIndices ?? fallbackIndices)
    .map((value) => Number(value))
    .filter((idx) => Number.isInteger(idx) && (!hasFirstHigh || idx >= firstHighIdx))
    .forEach((idx, position) => {
      const point = points[idx];
      const calcTemperature =
        point?.calcTemperature != null ? point.calcTemperature : point?.displayTemperature;
      const ignoredForCalc = point?.ignoredForCalc != null ? point.ignoredForCalc : point?.ignored;
      if (point && Number.isFinite(calcTemperature) && !ignoredForCalc && !map.has(idx)) {
        map.set(idx, position + 1);
      }
    });
  return map;
};

const buildBaselineOrderMap = ({ showInterpretation, ovulationDetails, firstHighIndex, points }) => {
  if (!showInterpretation || !ovulationDetails?.confirmed) return new Map();
  const firstHighIdx = Number(firstHighIndex);
  if (!Number.isInteger(firstHighIdx)) return new Map();
  const map = new Map();
  let order = 1;
  for (let idx = firstHighIdx - 1; idx >= 0 && order <= 6; idx -= 1) {
    const point = points[idx];
    const calcTemperature =
      point?.calcTemperature != null ? point.calcTemperature : point?.displayTemperature;
    const ignoredForCalc = point?.ignoredForCalc != null ? point.ignoredForCalc : point?.ignored;
    if (point && Number.isFinite(calcTemperature) && !ignoredForCalc) {
      map.set(idx, order);
      order += 1;
    }
  }
  return map;
};

export const drawBottomRows = ({
  ctx,
  chartWidth,
  padding,
  graphBottomY,
  rowsZoneHeight,
  textRowHeight,
  bottomRowsResponsiveFontSize,
  responsiveFontSize,
  points,
  xs,
  ysTemp,
  visibleStartIndex,
  visibleEndIndex,
  totalPoints,
  autoLabelStep,
  isFullScreen,
  exportMode,
  showRelationsRow,
  showInterpretation,
  ovulationDetails,
  firstHighIndex,
  manualModeEnabled,
  manualBaselineTemp,
  isPointEligibleForManualMode,
  measureTextWidth,
  textLayoutCache,
  isWithinTemperaturePlotArea,
}) => {
  const rowLineHeight = bottomRowsResponsiveFontSize(0.95);
  const obsRowIndex = isFullScreen ? 9 : 7.5;
  const halfBlock = isFullScreen ? 1 : 0.75;
  const exportExtraRows = exportMode ? 6 : 0;
  const baseRowCount = obsRowIndex + halfBlock + exportExtraRows;
  const autoRowH = Math.max(1, Math.floor((rowsZoneHeight || 0) / baseRowCount));
  const rowH = Math.max(textRowHeight || 1, autoRowH);
  const rowsTopY = graphBottomY;
  const dateRowY = rowsTopY + rowH * 1;
  const cycleDayRowY = rowsTopY + rowH * 2;
  const symbolRowYBase = rowsTopY + rowH * 3;
  const exportTextBlockHeight = rowLineHeight * 3;
  const exportSensationBlockTop = rowsTopY + rowH * (isFullScreen ? 4 : 3.5);
  const exportAppearanceBlockTop = exportSensationBlockTop + exportTextBlockHeight;
  const exportObservationBlockTop = exportAppearanceBlockTop + exportTextBlockHeight;
  const mucusSensationRowY = exportMode
    ? exportSensationBlockTop + exportTextBlockHeight / 2
    : rowsTopY + rowH * (isFullScreen ? 5 : 4.5);
  const mucusAppearanceRowY = exportMode
    ? exportAppearanceBlockTop + exportTextBlockHeight / 2
    : rowsTopY + rowH * (isFullScreen ? 7 : 6);
  const observationsRowY = exportMode
    ? exportObservationBlockTop + exportTextBlockHeight / 2
    : rowsTopY + rowH * (isFullScreen ? 9 : 7.5);
  const relationsRowY = showRelationsRow
    ? (exportMode
      ? exportObservationBlockTop + exportTextBlockHeight + rowH
      : observationsRowY + rowH * (isFullScreen ? 2 : 1.5))
    : null;
  const rowWidth = chartWidth - padding.left - padding.right;
  const cellWidth = totalPoints > 0 ? rowWidth / totalPoints : rowWidth;
  const cellTextPadding = Math.min(12, Math.max(4, cellWidth * 0.12));
  const availableTextWidth = Math.max(0, cellWidth - cellTextPadding * 2);
  const baseSensationFontSize = bottomRowsResponsiveFontSize(0.9);
  const baseAppearanceFontSize = bottomRowsResponsiveFontSize(0.9);
  const baseObservationFontSize = bottomRowsResponsiveFontSize(0.9);
  const smallSensationFontSize = bottomRowsResponsiveFontSize(0.8);
  const smallAppearanceFontSize = bottomRowsResponsiveFontSize(0.8);
  const smallObservationFontSize = bottomRowsResponsiveFontSize(0.8);
  const labelStep = (() => {
    if (!autoLabelStep || totalPoints < 2) return 1;
    const dayWidth = Math.abs((xs[1] ?? 0) - (xs[0] ?? 0));
    if (!Number.isFinite(dayWidth) || dayWidth <= 0) return 1;
    const samplePoint = points.find((entry) => entry?.date || entry?.cycleDay != null) ?? {};
    const sampleDate = compactDate(samplePoint?.date || '00/00');
    const sampleDay = String(samplePoint?.cycleDay ?? totalPoints ?? '');
    const dateFontSize = responsiveFontSize(1.05);
    const dayFontSize = responsiveFontSize(1);
    const minLabelWidth = Math.max(
      measureTextWidth(sampleDate, buildFontString(dateFontSize, 900)),
      measureTextWidth(sampleDay, buildFontString(dayFontSize, 900))
    ) + responsiveFontSize(0.8);
    return Math.max(1, Math.ceil(minLabelWidth / dayWidth));
  })();
  const getCachedLines = (cacheKey, text, fallback, baseFontSize, smallFontSize) => {
    const existing = textLayoutCache?.get(cacheKey);
    if (existing) return existing;
    const base = splitTextLinesByWidth(text, {
      maxWidth: availableTextWidth,
      maxLines: 3,
      fontSize: baseFontSize,
      fallback,
      measureTextWidth,
    });
    const lines = base[2]
      ? splitTextLinesByWidth(text, {
        maxWidth: availableTextWidth,
        maxLines: 3,
        fontSize: smallFontSize,
        fallback,
        measureTextWidth,
      })
      : base;
    const resolved = { lines, fontSize: base[2] ? smallFontSize : baseFontSize };
    textLayoutCache?.set(cacheKey, resolved);
    return resolved;
  };
  const countLines = (lines) =>
    Math.max(1, lines.filter((value) => value && String(value).trim() !== '').length);
  const centeredY = (baseY, lines) => baseY - ((lines - 1) * rowLineHeight) / 2;
  const centeredYInBlock = (blockTop, lines) => {
    const usedHeight = lines * rowLineHeight;
    return blockTop + Math.max(0, (exportTextBlockHeight - usedHeight) / 2) + rowLineHeight * 0.5;
  };
  const sensationColor = resolveCssColor(SENSATION_COLOR, '#0ea5e9');
  const appearanceColor = resolveCssColor(APPEARANCE_COLOR, '#10b981');
  const observationColor = resolveCssColor(OBSERVATION_COLOR, '#8b5cf6');
  const today = startOfDay(new Date());
  const highSequenceOrderMap = buildHighSequenceOrderMap({
    showInterpretation,
    ovulationDetails,
    firstHighIndex,
    points,
  });
  const baselineOrderMap = buildBaselineOrderMap({
    showInterpretation,
    ovulationDetails,
    firstHighIndex,
    points,
  });

  for (let index = visibleStartIndex; index <= visibleEndIndex; index += 1) {
    const point = points[index];
    if (!point) continue;
    const x = xs[index];
    if (!Number.isFinite(x)) continue;

    const y = ysTemp[index];
    const hasTemp = point.displayTemperature != null;
    const correctedTemp = point.temperature_corrected;
    const isCorrectedDisplayed =
      point.use_corrected && correctedTemp != null && point.displayTemperature === correctedTemp;
    const isIgnoredForDisplay =
      point.ignored || (point.use_corrected && !isCorrectedDisplayed);
    const shouldConsiderForManualMode = typeof isPointEligibleForManualMode === 'function'
      ? isPointEligibleForManualMode(point, index)
      : true;
    const matchesManualBaseline =
      manualModeEnabled &&
      shouldConsiderForManualMode &&
      Number.isFinite(manualBaselineTemp) &&
      Number.isFinite(point?.displayTemperature) &&
      normalizeTemp2(point.displayTemperature) === normalizeTemp2(manualBaselineTemp);

    if (matchesManualBaseline && isWithinTemperaturePlotArea(y)) {
      ctx.beginPath();
      ctx.arc(x, y, 6.2, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(124, 58, 237, 0.16)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(124, 58, 237, 0.38)';
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }

    const hasHighOrder = highSequenceOrderMap.has(index);
    const hasBaselineOrder = baselineOrderMap.has(index);
    if (showInterpretation && hasTemp && !isIgnoredForDisplay && Number.isFinite(y)) {
      const numberFontSize = responsiveFontSize(isFullScreen ? 0.75 : 1.2);
      const numberStrokeWidth = Math.max(0.5, numberFontSize * 0.18);
      if (hasHighOrder) {
        drawText({
          ctx,
          text: highSequenceOrderMap.get(index),
          x,
          y: y - numberFontSize * (isFullScreen ? 2.6 : 1.8),
          fontSize: numberFontSize,
          weight: 900,
          color: HIGH_SEQUENCE_NUMBER_COLOR,
          stroke: '#fff',
          strokeWidth: numberStrokeWidth,
        });
      }
      if (hasBaselineOrder) {
        drawText({
          ctx,
          text: baselineOrderMap.get(index),
          x,
          y: y + numberFontSize * (isFullScreen ? 1.9 : 1.6),
          fontSize: numberFontSize,
          weight: 800,
          color: BASELINE_NUMBER_COLOR,
          stroke: '#fff',
          strokeWidth: numberStrokeWidth,
        });
      }
    }

    const isFuture = point.isoDate
      ? isAfter(startOfDay(parseISO(point.isoDate)), today)
      : false;
    const isTodayPoint = point.isoDate ? isSameDay(parseISO(point.isoDate), today) : false;
    const textFill = isTodayPoint ? TODAY_HIGHLIGHT_COLOR : '#60666f';
    const shouldRenderXLabel = !autoLabelStep || index % labelStep === 0 || index === totalPoints - 1;
    if (shouldRenderXLabel) {
      drawText({
        ctx,
        text: compactDate(point.date),
        x,
        y: dateRowY,
        fontSize: responsiveFontSize(1.05),
        weight: 900,
        color: textFill,
        baseline: 'alphabetic',
      });
      drawText({
        ctx,
        text: point.cycleDay,
        x,
        y: cycleDayRowY,
        fontSize: responsiveFontSize(1),
        weight: 900,
        color: textFill,
        baseline: 'alphabetic',
      });
    }

    const symbolInfo = getSymbolAppearance(point.fertility_symbol);
    const symbolPalette = getSymbolColorPalette(symbolInfo.value);
    const isPlaceholder = String(point.id || '').startsWith('placeholder-');
    const shouldRenderSymbol = !isPlaceholder && symbolInfo.value !== 'none';
    const peakStatus = point.peakStatus ? String(point.peakStatus).toUpperCase() : null;
    const isPeakMarker = peakStatus === 'P' || peakStatus === 'X';
    const isPostPeakMarker = peakStatus && !isPeakMarker;
    const isPeakSeriesDay = isPeakMarker || ['1', '2', '3'].includes(peakStatus);
    const peakDisplay = peakStatus || '-';
    const symbolRectSize = responsiveFontSize(isFullScreen ? 1.8 : 2);
    const symbolX = x - symbolRectSize / 2 - 4;
    const symbolY = symbolRowYBase - symbolRectSize * 0.75;
    const symbolW = symbolRectSize * 1.4;
    const symbolH = symbolRectSize;
    const symbolTextY = symbolY + symbolH / 2 + 2;
    const peakCenterY = symbolRowYBase - symbolRectSize * 0.25;

    if (shouldRenderSymbol) {
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.08)';
      drawRoundedRect(ctx, x - symbolRectSize / 2 + 1, symbolY + 1, symbolRectSize, symbolH, symbolRectSize * 0.25);
      ctx.fill();
      drawRoundedRect(ctx, symbolX, symbolY, symbolW, symbolH, symbolRectSize * 0.2);
      if (symbolInfo.pattern === 'spotting-pattern') {
        ctx.fillStyle = symbolPalette.main;
        ctx.fill();
        ctx.save();
        drawRoundedRect(ctx, symbolX, symbolY, symbolW, symbolH, symbolRectSize * 0.2);
        ctx.clip();
        const patternStep = 6;
        const dotRadius = 1.5;
        const startX = symbolX + 3;
        const startY = symbolY + 3;
        ctx.fillStyle = 'rgba(255,255,255,0.88)';
        for (let dotY = startY; dotY <= symbolY + symbolH + dotRadius; dotY += patternStep) {
          for (let dotX = startX; dotX <= symbolX + symbolW + dotRadius; dotX += patternStep) {
            ctx.beginPath();
            ctx.arc(dotX, dotY, dotRadius, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        ctx.restore();
      } else {
        ctx.fillStyle = symbolPalette.main;
        ctx.fill();
      }
      const strokeColor = symbolPalette.border === 'none'
        ? null
        : (symbolPalette.border || SYMBOL_BORDER_FALLBACK);
      if (strokeColor) {
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = symbolInfo.value === 'white' ? 1.6 : 1;
        ctx.stroke();
      }
      ctx.restore();
      if (peakStatus) {
        if (isPeakMarker) {
          drawPeakCross(ctx, x, peakCenterY, 4, 2, 4);
        } else {
          drawText({
            ctx,
            text: peakStatus,
            x,
            y: symbolTextY,
            fontSize: responsiveFontSize(1.1),
            weight: 800,
            color: POST_PEAK_MARKER_COLOR,
          });
        }
      }
    } else {
      if (isPeakSeriesDay) {
        ctx.save();
        drawRoundedRect(ctx, symbolX, symbolY, symbolW, symbolH, symbolRectSize * 0.2);
        ctx.strokeStyle = isPeakMarker ? PEAK_MARKER_COLOR : POST_PEAK_MARKER_COLOR;
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.restore();
      }
      if (isPeakMarker) {
        drawPeakCross(ctx, x, peakCenterY, 4, 2, 4);
      } else {
        drawText({
          ctx,
          text: peakDisplay,
          x,
          y: symbolTextY,
          fontSize: responsiveFontSize(isPostPeakMarker ? 1.1 : 1),
          weight: isPostPeakMarker ? 800 : 500,
          color: isPostPeakMarker ? POST_PEAK_MARKER_COLOR : '#60666f',
        });
      }
    }

    const sensText = exportMode
      ? (point.mucus_sensation ?? '')
      : isFullScreen
        ? limitWords(point.mucus_sensation, 2, isFuture ? '' : '-')
        : point.mucus_sensation;
    const aparText = exportMode
      ? (point.mucus_appearance ?? '')
      : isFullScreen
        ? limitWords(point.mucus_appearance, 2, isFuture ? '' : '-')
        : point.mucus_appearance;
    const obsText = exportMode
      ? (point.observations ?? '')
      : isFullScreen
        ? limitWords(point.observations, 2, '')
        : point.observations;
    const pointKey = `${point.isoDate || point.id || index}`;
    const sensRes = getCachedLines(
      `${pointKey}-sens-${availableTextWidth}-${baseSensationFontSize}-${smallSensationFontSize}-${sensText ?? ''}`,
      sensText,
      isFuture ? '' : '-',
      baseSensationFontSize,
      smallSensationFontSize
    );
    const aparRes = getCachedLines(
      `${pointKey}-apar-${availableTextWidth}-${baseAppearanceFontSize}-${smallAppearanceFontSize}-${aparText ?? ''}`,
      aparText,
      isFuture ? '' : '-',
      baseAppearanceFontSize,
      smallAppearanceFontSize
    );
    const obsRes = getCachedLines(
      `${pointKey}-obs-${availableTextWidth}-${baseObservationFontSize}-${smallObservationFontSize}-${obsText ?? ''}`,
      obsText,
      '',
      baseObservationFontSize,
      smallObservationFontSize
    );
    const drawMultiline = (lines, xValue, yValue, fontSize, color) => {
      lines.forEach((line, offset) => {
        if (!line) return;
        drawText({
          ctx,
          text: line,
          x: xValue,
          y: yValue + offset * rowLineHeight,
          fontSize,
          weight: 700,
          color,
        });
      });
    };
    const sensY = exportMode
      ? centeredYInBlock(exportSensationBlockTop, countLines(sensRes.lines))
      : centeredY(mucusSensationRowY, countLines(sensRes.lines));
    const aparY = exportMode
      ? centeredYInBlock(exportAppearanceBlockTop, countLines(aparRes.lines))
      : centeredY(mucusAppearanceRowY, countLines(aparRes.lines));
    const obsY = exportMode
      ? centeredYInBlock(exportObservationBlockTop, countLines(obsRes.lines))
      : centeredY(observationsRowY, countLines(obsRes.lines));
    drawMultiline(sensRes.lines, x, sensY, sensRes.fontSize, sensationColor);
    drawMultiline(aparRes.lines, x, aparY, aparRes.fontSize, appearanceColor);
    drawMultiline(obsRes.lines, x, obsY, obsRes.fontSize, observationColor);

    const hasRelations = Boolean(point.had_relations ?? point.hadRelations);
    if (showRelationsRow && relationsRowY != null && hasRelations) {
      const rowBlockHeight = rowH * (isFullScreen ? 2 : 1.5);
      const relationsHeartSize = Math.min(Math.max(rowBlockHeight * 0.46, 14), 18);
      drawHeart(ctx, x - relationsHeartSize / 2, relationsRowY - relationsHeartSize / 2, relationsHeartSize);
    }
  }
};
