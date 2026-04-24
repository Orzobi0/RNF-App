import React, { useMemo } from 'react';
import { getSymbolAppearance, getSymbolColorPalette } from '@/config/fertilitySymbols';

const PALETTE = {
  pageBg: '#fffdfd',
  panelBg: '#ffffff',
  panelBorder: '#f3d7e2',
  chartBg: '#ffffff',
  chartBorder: '#e8bfd0',
  gridMajor: '#efc1d1',
  gridMinor: '#f8e3eb',
  verticalMajor: '#efd0dc',
  verticalMinor: '#f7e7ee',
  textStrong: '#8f1a55',
  text: '#475569',
  textMuted: '#64748b',
  tempLine: '#e25576',
  tempLineHalo: '#fff2f7',
  tempPoint: '#e25576',
  tempPointIgnoredFill: '#d4dbe6',
  tempPointIgnoredStroke: '#8a95a8',
  correctionLine: '#94a3b8',
  rowHeaderBg: '#fce7f0',
  rowBorder: '#e8cbd7',
  rowAlt: '#fff8fb',
};

const DEFAULT_TEMP_MIN = 36.0;
const DEFAULT_TEMP_MAX = 37.5;

const TEXT_RULES = {
  date: { maxLines: 1, maxCharsBase: 11 },
  cycleDay: { maxLines: 1, maxCharsBase: 6 },
  fertility_symbol: { maxLines: 1, maxCharsBase: 12 },
  mucusSensation: { maxLines: 5, maxCharsBase: 22 },
  mucusAppearance: { maxLines: 5, maxCharsBase: 22 },
  observations: { maxLines: 5, maxCharsBase: 24 },
  had_relations: { maxLines: 1, maxCharsBase: 4 },
};

const normalizeTemp = (value) => {
  if (value === null || value === undefined) return null;

  const normalized = String(value).trim().replace(',', '.');
  if (!normalized) return null;

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

const toSafeBool = (value) => {
  if (value === true || value === false) return value;
  if (typeof value === 'number') return value === 1;

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['1', 'true', 'yes', 'si', 'sí'].includes(normalized)) return true;
    if (['0', 'false', 'no', ''].includes(normalized)) return false;
  }

  return false;
};

const resolveTemperaturePoint = (entry, index) => {
  const measurements = Array.isArray(entry?.measurements) ? entry.measurements : [];
  const selectedMeasurement =
    measurements.find((measurement) => measurement?.selected) ?? null;

  const useCorrected = toSafeBool(
    selectedMeasurement?.use_corrected ?? entry?.use_corrected
  );

  const raw = normalizeTemp(
    selectedMeasurement?.temperature ??
      entry?.temperature_raw ??
      entry?.temperature_chart ??
      null
  );

  const corrected = normalizeTemp(
    selectedMeasurement?.temperature_corrected ??
      entry?.temperature_corrected ??
      null
  );

  const displayTemperature = normalizeTemp(
  entry?.displayTemperature ??
    (useCorrected ? corrected : raw) ??
    corrected ??
    raw
);

if (displayTemperature === null) return null;

  const ignored = toSafeBool(
    selectedMeasurement?.ignoredForCalc ??
      selectedMeasurement?.ignored ??
      entry?.ignoredForCalc ??
      entry?.ignored
  );

  const hasCorrection =
    useCorrected &&
    raw !== null &&
    corrected !== null &&
    Math.abs(corrected - raw) > 1e-6 &&
    Math.abs(displayTemperature - corrected) < 1e-6;

  return {
  index,
  cycleDay: Number.isFinite(Number(entry?.cycleDay)) ? Number(entry.cycleDay) : index + 1,
  displayTemperature,
  raw,
  corrected,
  ignored,
  hasCorrection,
};
};

const buildTempTicks = (minTemp, maxTemp) => {
  const ticks = [];
  for (let t = minTemp; t <= maxTemp + 1e-6; t += 0.1) ticks.push(Number(t.toFixed(1)));
  return ticks;
};

const formatDateShort = (entry) => {
  const raw = String(entry?.date ?? entry?.isoDate ?? '').trim();
  if (!raw) return '';
  if (/^\d{2}\/\d{2}$/.test(raw)) return raw;

  const source = entry?.isoDate ?? raw;
  const date = new Date(source);
  if (Number.isNaN(date.getTime())) return raw;

  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${day}/${month}`;
};

const wrapTextWithLimit = (text, maxCharsPerLine, maxLines) => {
  const value = String(text ?? '').trim();
  if (!value) return [];

  const words = value.split(/\s+/);
  const lines = [];
  let current = '';

  words.forEach((word) => {
    if (!current) {
      current = word;
      return;
    }
    const candidate = `${current} ${word}`;
    if (candidate.length <= maxCharsPerLine) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
  });

  if (current) lines.push(current);
  if (lines.length <= maxLines) return lines;

  const truncated = lines.slice(0, maxLines);
  truncated[maxLines - 1] = `${truncated[maxLines - 1].replace(/[.\s…]+$/g, '').slice(0, Math.max(1, maxCharsPerLine - 1))}…`;
  return truncated;
};

const getCellLines = (entry, rowKey, colW) => {
  if (rowKey === 'fertility_symbol') {
    const symbol = getSymbolAppearance(entry?.fertility_symbol);
    if (!symbol || symbol.value === 'none') return [];
    return [symbol.label ?? ''];
  }

  let base = '';
  if (rowKey === 'date') base = formatDateShort(entry);
  else if (rowKey === 'cycleDay') base = entry?.cycleDay ? `D${entry.cycleDay}` : '';
  else if (rowKey === 'had_relations') base = entry?.had_relations ? 'Sí' : '';
  else base = entry?.[rowKey] ?? '';

  const rules = TEXT_RULES[rowKey] ?? { maxLines: 2, maxCharsBase: 16 };
  const maxCharsPerLine = Math.max(4, Math.min(32, Math.floor(colW / 7.2) + Math.floor(rules.maxCharsBase / 4)));
  return wrapTextWithLimit(base, maxCharsPerLine, rules.maxLines);
};

const drawSymbol = ({ entry, x, y, size }) => {
  const symbolInfo = getSymbolAppearance(entry?.fertility_symbol);
  if (!symbolInfo || symbolInfo.value === 'none') return null;

  const palette = getSymbolColorPalette(symbolInfo.value);
  const symbolFill = symbolInfo.pattern === 'spotting-pattern' ? 'url(#spotting-pattern-pdf)' : palette.main;
  const stroke = palette.border === 'none' ? 'none' : palette.border || '#cbd5e1';

  return (
    <g>
      <rect
        x={x - size / 2}
        y={y - size / 2}
        width={size}
        height={size}
        rx={Math.max(2, size * 0.2)}
        fill={symbolFill}
        stroke={stroke}
        strokeWidth={stroke === 'none' ? 0 : symbolInfo.value === 'white' ? 1.4 : 1}
      />
    </g>
  );
};

const FertilityChartPdf = ({
  entries = [],
  width = 1600,
  height = 900,
  title = '',
  includeRs = true,
  embedded = false,
  showTitle = true,
  fixedDaySlots = 31,
}) => {
  const layout = useMemo(() => {
    const margin = embedded
  ? { top: 6, right: 18, bottom: 12, left: 18 }
  : { top: 20, right: 24, bottom: 18, left: 24 };

const panelPadding = embedded ? 8 : 14;
const titleH = showTitle ? 30 : 0;
const chartRowsGap = 6;

const panelInnerH = height - margin.top - margin.bottom - panelPadding * 2 - titleH;
const graphAreaH = Math.round(panelInnerH * 0.31);
const rowsAreaH = panelInnerH - graphAreaH;

    const rows = [
      { key: 'date', label: 'Fecha', minHeight: 17, lineHeight: 9.5, paddingY: 3.5 },
      { key: 'cycleDay', label: 'Día', minHeight: 17, lineHeight: 9.5, paddingY: 3.5 },
      { key: 'fertility_symbol', label: 'Símbolo', minHeight: 20, lineHeight: 10, paddingY: 3.8 },
      { key: 'mucusSensation', label: 'Sensación', minHeight: 18, lineHeight: 9.8, paddingY: 3.5 },
      { key: 'mucusAppearance', label: 'Apariencia', minHeight: 18, lineHeight: 9.8, paddingY: 3.5 },
      { key: 'observations', label: 'Observaciones', minHeight: 18, lineHeight: 9.8, paddingY: 3.5 },
    ];

    if (includeRs) rows.push({ key: 'had_relations', label: 'RS', minHeight: 17, lineHeight: 9.5, paddingY: 3.5 });

    const temperaturePoints = entries
  .map((entry, index) => resolveTemperaturePoint(entry, index))
  .filter(Boolean);

const calculationTemperatures = temperaturePoints
  .filter((point) => !point.ignored)
  .map((point) => point.displayTemperature)
  .filter((value) => value !== null);

const safeMin = calculationTemperatures.length
  ? Math.min(...calculationTemperatures)
  : DEFAULT_TEMP_MIN;
const safeMax = calculationTemperatures.length
  ? Math.max(...calculationTemperatures)
  : DEFAULT_TEMP_MAX;
    const desiredRange = DEFAULT_TEMP_MAX - DEFAULT_TEMP_MIN;
    let minTemp = Math.floor((Math.min(safeMin, DEFAULT_TEMP_MIN) - 0.1) * 10) / 10;
    let maxTemp = Math.ceil((Math.max(safeMax, DEFAULT_TEMP_MAX) + 0.1) * 10) / 10;

    if (maxTemp - minTemp < desiredRange) {
      const midpoint = (minTemp + maxTemp) / 2;
      minTemp = Math.floor((midpoint - desiredRange / 2) * 10) / 10;
      maxTemp = Math.ceil((midpoint + desiredRange / 2) * 10) / 10;
    }

    const dayCount = Math.max(1, entries.length);
const chartLeft = margin.left + panelPadding + 78;

const maxChartRight = width - margin.right - panelPadding;
const maxChartW = maxChartRight - chartLeft;

// 31 huecos estándar.
// Si algún día hubiese más de 31, no desbordamos: reducimos para que siga cabiendo.
const slotCount = Math.max(dayCount, fixedDaySlots);

const colW = maxChartW / slotCount;
const chartW = colW * dayCount;
const chartRight = chartLeft + chartW;

    const panelX = margin.left;
    const panelY = margin.top;
    const panelW = width - margin.left - margin.right;

    const titleY = panelY + panelPadding + 8;
    const chartTop = panelY + panelPadding + titleH;
    const chartBottom = chartTop + graphAreaH;
    const rowsTop = chartBottom + chartRowsGap;
    const rowHeights = rows.map((row) => {
      const maxLines = Math.max(
        1,
        ...entries.map((entry) => {
          if (row.key === 'fertility_symbol') {
            const symbol = getSymbolAppearance(entry?.fertility_symbol);
            return symbol && symbol.value !== 'none' ? 1 : 0;
          }
          return getCellLines(entry, row.key, colW).length;
        }),
      );
      return Math.max(row.minHeight, row.paddingY * 2 + maxLines * row.lineHeight);
    });
    const rowsContentH = rowHeights.reduce((acc, value) => acc + value, 0);
    const rowsBottom = rowsTop + rowsContentH;
    const panelContentBottom = rowsBottom + panelPadding;
    const panelH = panelContentBottom - panelY;
    const svgHeight = panelContentBottom + margin.bottom;

    return {
      margin,
      panelPadding,
      panelX,
      panelY,
      panelW,
      panelH,
      svgHeight,
      titleY,
      graphAreaH,
      rowsAreaH,
      chartRowsGap,
      rows,
      rowHeights,
      rowsBottom,
      minTemp,
      maxTemp,
      ticks: buildTempTicks(minTemp, maxTemp),
      chartLeft,
      chartRight,
      chartW,
      colW,
      chartTop,
      chartBottom,
      rowsTop,
      dayCount,
      temperaturePoints,
    };
  }, [embedded, entries, fixedDaySlots, height, includeRs, showTitle, width]);

  const tempRange = Math.max(layout.maxTemp - layout.minTemp, 0.1);
  const getX = (index) => layout.chartLeft + layout.colW * (index + 0.5);
  const getY = (temperature) =>
    layout.chartBottom - ((temperature - layout.minTemp) / tempRange) * layout.graphAreaH;

  const inDisplayRange = (temp) =>
  temp !== null && temp >= layout.minTemp && temp <= layout.maxTemp;

  const points = layout.temperaturePoints
    .filter(Boolean)
    .filter((point) => point.displayTemperature !== null)
    .filter((point) => inDisplayRange(point.displayTemperature));

   // - La línea principal solo usa puntos válidos NO ignorados y tramos consecutivos.
  // - La línea secundaria conecta todos los puntos válidos en orden cuando hay huecos.
  const linePoints = points.filter((point) => !point.ignored);

  let mainPath = '';
  let lastValidIndex = null;
  let hasIndexGaps = false;

  linePoints.forEach((point) => {
    const x = getX(point.index);
    const y = getY(point.displayTemperature);

    if (lastValidIndex !== null) {
      if (point.index === lastValidIndex + 1) {
        mainPath += ` L ${x} ${y}`;
      } else {
        mainPath += `${mainPath ? ' ' : ''}M ${x} ${y}`;
        hasIndexGaps = true;
      }
    } else {
      mainPath = `M ${x} ${y}`;
    }

    lastValidIndex = point.index;
  });

    const hasContinuousSegment = mainPath.includes('L');
  const gapConnectorPath =
    hasIndexGaps && linePoints.length > 1
      ? linePoints
          .map((point, idx) => {
            const x = getX(point.index);
            const y = getY(point.displayTemperature);
            return `${idx === 0 ? 'M' : 'L'} ${x} ${y}`;
          })
          .join(' ')
      : '';

  let rowCursor = layout.rowsTop;

  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={width} height={layout.svgHeight} viewBox={`0 0 ${width} ${layout.svgHeight}`}>
      <defs>
        <linearGradient id="pdf-temp-line-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#f9738f" />
          <stop offset="50%" stopColor="#e25576" />
          <stop offset="100%" stopColor="#be2f5e" />
        </linearGradient>
        <pattern id="spotting-pattern-pdf" patternUnits="userSpaceOnUse" width="6" height="6">
          <rect width="6" height="6" fill="#fb7185" />
          <circle cx="3" cy="3" r="1.4" fill="rgba(255,255,255,0.85)" />
        </pattern>
      </defs>

      <rect x="0" y="0" width={width} height={layout.svgHeight} fill={PALETTE.pageBg} />
      <rect
        x={layout.panelX}
        y={layout.panelY}
        width={layout.panelW}
        height={layout.panelH}
        rx="16"
        fill={PALETTE.panelBg}
        stroke={PALETTE.panelBorder}
      />

      {showTitle ? (
  <text x={layout.chartLeft} y={layout.titleY} fontSize="20" fontWeight="700" fill={PALETTE.textStrong}>
    {title}
  </text>
) : null}

      <rect
        x={layout.chartLeft}
        y={layout.chartTop}
        width={layout.chartW}
        height={layout.graphAreaH}
        fill={PALETTE.chartBg}
        stroke={PALETTE.chartBorder}
      />

      {layout.ticks.map((tick) => {
        const y = getY(tick);
        const major = Math.abs((tick * 10) % 5) < 1e-9;
        return (
          <g key={`tick-${tick}`}>
            <line
              x1={layout.chartLeft}
              y1={y}
              x2={layout.chartRight}
              y2={y}
              stroke={major ? PALETTE.gridMajor : PALETTE.gridMinor}
              strokeWidth={major ? 1 : 0.8}
            />
            <text
              x={layout.chartLeft - 10}
              y={y + 4}
              fontSize="11.2"
              textAnchor="end"
              fill={PALETTE.text}
            >
              {tick.toFixed(1)}
            </text>
          </g>
        );
      })}

      {entries.map((entry, index) => {
        const x = getX(index);
        const major = entry?.cycleDay ? entry.cycleDay % 4 === 0 : index % 4 === 3;
        return (
          <line
            key={`v-${entry?.id ?? index}`}
            x1={x}
            y1={layout.chartTop}
            x2={x}
            y2={layout.chartBottom}
            stroke={major ? PALETTE.verticalMajor : PALETTE.verticalMinor}
            strokeWidth={major ? 0.75 : 0.55}
          />
        );
      })}

      <rect
        x={layout.chartLeft}
        y={layout.chartTop}
        width={layout.chartW}
        height={layout.graphAreaH}
        fill="none"
        stroke={PALETTE.chartBorder}
        strokeWidth="1.2"
      />

      <text x={layout.margin.left + 18} y={layout.chartTop + 14} fontSize="11.5" fontWeight="600" fill={PALETTE.textStrong}>
        Temperatura (°C)
      </text>

   {hasContinuousSegment && (
        <path
          d={mainPath}
          fill="none"
          stroke={PALETTE.tempLineHalo}
          strokeOpacity="0.95"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}

      {gapConnectorPath && (
        <path
          d={gapConnectorPath}
          fill="none"
          stroke="#cf6f95"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="5 5"
          strokeOpacity="0.85"
        />
      )}

      {hasContinuousSegment && (
        <path
          d={mainPath}
          fill="none"
          stroke="url(#pdf-temp-line-gradient)"
          strokeWidth="1.9"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}

      {points.map((point) => {
        const cx = getX(point.index);
        const cy = getY(point.displayTemperature);
        const rawOutOfRangeTop =
          point.hasCorrection &&
          point.raw !== null &&
          point.raw > layout.maxTemp;
        const rawOutOfRangeBottom =
          point.hasCorrection &&
          point.raw !== null &&
          point.raw < layout.minTemp;
        const rawVisible =
          point.hasCorrection &&
          point.raw !== null &&
          inDisplayRange(point.raw);
        const rawY = rawVisible ? getY(point.raw) : null;
        const rawClampedY = rawOutOfRangeTop
          ? getY(layout.maxTemp)
          : rawOutOfRangeBottom
            ? getY(layout.minTemp)
            : rawY;
        const showClampedCorrection =
          point.hasCorrection &&
          point.raw !== null &&
          rawClampedY !== null &&
          Math.abs(rawClampedY - cy) > 0.001;
        const isIgnored = point.ignored;

        return (
          <g key={`p-${point.index}`}>
            {showClampedCorrection ? (
              <>
                <line
                  x1={cx}
                  y1={rawClampedY}
                  x2={cx}
                  y2={cy}
                  stroke={PALETTE.correctionLine}
                  strokeWidth="1"
                  strokeDasharray="4 4"
                />
                {rawVisible && rawY !== null ? (
                  <circle cx={cx} cy={rawY} r="2.8" fill="#dbe1ea" stroke="#9aa5b8" strokeWidth="1" />
                ) : null}
              </>
            ) : null}
            <circle cx={cx} cy={cy} r="4.2" fill="#ffffff" fillOpacity="0.96" />
            <circle
              cx={cx}
              cy={cy}
              r="3.4"
              fill={isIgnored ? PALETTE.tempPointIgnoredFill : PALETTE.tempPoint}
              stroke={isIgnored ? PALETTE.tempPointIgnoredStroke : '#ffffff'}
              strokeWidth="1.25"
            />
          </g>
        );
      })}

      {layout.rows.map((row, rowIndex) => {
        const rowH = layout.rowHeights[rowIndex];
        const y = rowCursor;
        rowCursor += rowH;

        return (
          <g key={row.key}>
            <rect
              x={layout.margin.left + layout.panelPadding}
              y={y}
              width={layout.chartLeft - (layout.margin.left + layout.panelPadding)}
              height={rowH}
              fill={PALETTE.rowHeaderBg}
              stroke={PALETTE.rowBorder}
            />
            <text x={layout.margin.left + layout.panelPadding + 10} y={y + rowH / 2 + 4} fontSize="11.2"  fill={PALETTE.text}>
              {row.label}
            </text>

            <rect
              x={layout.chartLeft}
              y={y}
              width={layout.chartW}
              height={rowH}
              fill={rowIndex % 2 === 0 ? '#fff' : PALETTE.rowAlt}
              stroke={PALETTE.rowBorder}
            />

            {entries.map((entry, colIndex) => {
              const x = layout.chartLeft + colIndex * layout.colW;
              const cx = x + layout.colW / 2;
              const lines = getCellLines(entry, row.key, layout.colW);
              const lineGap = row.lineHeight;
              const textStartY = y + Math.max(12, rowH / 2 - ((lines.length - 1) * lineGap) / 2);

              return (
                <g key={`${row.key}-${entry?.id ?? colIndex}`}>
                  <line x1={x} y1={y} x2={x} y2={y + rowH} stroke={PALETTE.rowBorder} strokeWidth="0.8" />
                  {row.key === 'fertility_symbol' ? (
                    <>
                      {drawSymbol({
                        entry,
                        x: cx,
                        y: y + rowH * 0.5,
                        size: Math.min(rowH * 0.68, layout.colW * 0.58),
                      })}
                    </>
                  ) : (
                    lines.map((line, lineIndex) => (
                      <text
                        key={`${row.key}-${colIndex}-${lineIndex}`}
                        x={cx}
                        y={textStartY + lineIndex * lineGap}
                        fontSize="11.2"
                        textAnchor="middle"
                        fill={PALETTE.text}
                      >
                        {line}
                      </text>
                    ))
                  )}
                </g>
              );
            })}
            <line x1={layout.chartRight} y1={y} x2={layout.chartRight} y2={y + rowH} stroke={PALETTE.rowBorder} strokeWidth="0.8" />
          </g>
        );
      })}
      <line x1={layout.chartLeft} y1={layout.rowsBottom} x2={layout.chartRight} y2={layout.rowsBottom} stroke={PALETTE.rowBorder} strokeWidth="0.8" />
    </svg>
  );
};

export default FertilityChartPdf;