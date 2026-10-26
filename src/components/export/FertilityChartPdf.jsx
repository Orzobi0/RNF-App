import React from 'react';
import { Heart } from 'lucide-react';
import { chartTheme } from '@/components/chartElements/chartTheme';
import { getSymbolAppearance, getSymbolColorPalette } from '@/config/fertilitySymbols';

const PALETTE = {
  textStrong: chartTheme.palette.darkRoseText,
  text: '#475569',
  tempLine: chartTheme.palette.mainBrand,
  tempPoint: chartTheme.points.fill,
};

// Category tokens from src/index.css, kept explicit for standalone SVG export.
const ROW_ACCENTS = {
  mucusSensation: { color: '#4C9BB8' },
  mucusAppearance: { color: '#5BBF9A' },
  observations: { color: '#B58ACB' },
  had_relations: { color: '#E37988' },
};

const DEFAULT_TEMP_MIN = 36.0;
const DEFAULT_TEMP_MAX = 37.2;

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

export const resolveTemperaturePoint = (entry, index) => {
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
    (selectedMeasurement ? (useCorrected ? corrected : raw) : entry?.displayTemperature) ??
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
  for (let tenth = Math.round(minTemp * 10); tenth <= Math.round(maxTemp * 10); tenth++) ticks.push(tenth / 10);
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

const normalizePeakStatus = (value) => {
  if (value == null) return '';

  const status = String(value).trim().toUpperCase();

  if (status === 'P' || status === 'PEAK') return 'P';
  if (status === '1' || status === 'P1' || status === 'P+1') return '1';
  if (status === '2' || status === 'P2' || status === 'P+2') return '2';
  if (status === '3' || status === 'P3' || status === 'P+3') return '3';

  return '';
};

const getEntryPeakStatus = (entry) =>
  normalizePeakStatus(
    entry?.normalizedPeakStatus ??
      entry?.peakStatus ??
      entry?.peak_marker
  );

const drawSymbol = ({ entry, x, y, width, height }) => {
  const symbolInfo = getSymbolAppearance(entry?.fertility_symbol);
  if (!symbolInfo || symbolInfo.value === 'none') return null;

  const symbolW = Math.max(0, width ?? 0);
  const symbolH = Math.max(0, height ?? 0);

  if (!symbolW || !symbolH) return null;

  const palette = getSymbolColorPalette(symbolInfo.value);
  const symbolFill = symbolInfo.pattern === 'spotting-pattern' ? 'url(#spotting-pattern-pdf)' : palette.main;
  const stroke = palette.border === 'none' ? 'none' : palette.border || '#cbd5e1';

  return (
    <g>
      <rect
        x={x - symbolW / 2}
        y={y - symbolH / 2}
        width={symbolW}
        height={symbolH}
        rx={Math.max(2, Math.min(symbolW, symbolH) * 0.22)}
        fill={symbolFill}
        stroke={stroke}
        strokeWidth={stroke === 'none' ? 0 : symbolInfo.value === 'white' ? 1.4 : 1}
      />
    </g>
  );
};

// Logical units are paper points, independent of raster resolution (240 dpi).
export const PDF_CHART = Object.freeze({ width: 273 * 72 / 25.4, labelWidth: 70, slots: 31, fontSize: 6, lineHeight: 7.5, maxCellLines: 5 });
export const getCycleTemperatureRange = (entries) => {
  let min = DEFAULT_TEMP_MIN;
  let max = DEFAULT_TEMP_MAX;
  entries.forEach((entry, index) => {
    const point = resolveTemperaturePoint(entry, index);
    if (!point) return;
    const values = point.hasCorrection ? [point.displayTemperature, point.raw] : [point.displayTemperature];
    values.forEach(value => { min = Math.min(min, value - 0.1); max = Math.max(max, value + 0.1); });
  });
  // Round only the axis limits outwards; tolerance avoids an extra step from
  // floating-point arithmetic at an exact tenth. Measurement values stay intact.
  return { minTemp: Math.floor(min * 10 + 1e-9) / 10, maxTemp: Math.ceil(max * 10 - 1e-9) / 10 };
};

export const buildTemperaturePaths = (points, getX, getY) => {
  const valid = points.filter(point => !point.ignored);
  let mainPath = '';
  let gapConnectorPath = '';
  for (let i = 1; i < valid.length; i++) {
    const a = valid[i - 1];
    const b = valid[i];
    const segment = `M ${getX(a.index)} ${getY(a.displayTemperature)} L ${getX(b.index)} ${getY(b.displayTemperature)} `;
    if (b.cycleDay === a.cycleDay + 1 && b.index === a.index + 1) mainPath += segment;
    else gapConnectorPath += segment;
  }
  return { mainPath: mainPath.trim(), gapConnectorPath: gapConnectorPath.trim() };
};

let cellTextContext;
// Canvas and SVG use the same Arial size in logical paper points.
// Reserve one point on either side of the centered cell text.
export const getPdfCellLines = (text, widthPt = (PDF_CHART.width - PDF_CHART.labelWidth) / PDF_CHART.slots - 2) => {
  const value = String(text ?? '').trim();
  if (!value) return [];
  cellTextContext ??= document.createElement('canvas').getContext('2d');
  if (!cellTextContext) throw new Error('No se pudo medir el texto de la gráfica PDF.');
  cellTextContext.font = `${PDF_CHART.fontSize}px Arial`;
  const fits = value => cellTextContext.measureText(value).width <= widthPt;
  const segmenter = typeof Intl.Segmenter === 'function'
    ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;
  const lines = [];
  for (const paragraph of value.split(/\r?\n/)) {
    let line = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      if (line && fits(`${line} ${word}`)) { line += ` ${word}`; continue; }
      if (line) { lines.push(line); line = ''; }
      const characters = segmenter
        ? Array.from(segmenter.segment(word), part => part.segment) : Array.from(word);
      for (const character of characters) {
        if (line && !fits(line + character)) { lines.push(line); line = ''; }
        line += character;
      }
    }
    lines.push(line);
  }
  return lines;
};

export const preparePdfChart = (entries = [], includeRs = true, temperatureRange = getCycleTemperatureRange(entries)) => {
  if (entries.length > PDF_CHART.slots) throw new Error('Un bloque PDF no puede superar 31 días.');
  const notes = [];
  const cells = entries.map(entry => {
    const result = {};
    for (const [key, label] of [['mucusSensation', 'Sensación'], ['mucusAppearance', 'Apariencia'], ['observations', 'Observaciones']]) {
      const text = String(entry?.[key] ?? '');
      const lines = getPdfCellLines(text);
      if (lines.length <= PDF_CHART.maxCellLines) {
        result[key] = lines;
      } else {
        // Numbering is local to the identified block: at most 31 days x 3 fields.
        // A dedicated fifth line keeps even [93] inside the fixed-width column.
        const number = notes.length + 1;
        result[key] = [...lines.slice(0, PDF_CHART.maxCellLines - 1), `[${number}]`];
        notes.push({ number, cycleDay: entry.cycleDay, date: formatDateShort(entry), label, text });
      }
    }
    result.date = [formatDateShort(entry)];
    result.cycleDay = [String(entry.cycleDay ?? '')];
    result.had_relations = [toSafeBool(entry.had_relations) ? 'Sí' : ''];
    return result;
  });
  const rows = [
    { key: 'date', label: 'Fecha' }, { key: 'cycleDay', label: 'Día del ciclo' },
    { key: 'fertility_symbol', label: 'Símbolo' },
    { key: 'mucusSensation', label: 'Sensación' }, { key: 'mucusAppearance', label: 'Apariencia' },
    { key: 'observations', label: 'Observaciones' },
    ...(includeRs ? [{ key: 'had_relations', label: 'Relaciones' }] : []),
  ].map(row => {
    const isTextRow = ['mucusSensation', 'mucusAppearance', 'observations'].includes(row.key);
    const fontSize = isTextRow ? PDF_CHART.fontSize : row.key === 'date' ? 7.5 : 8;
    const lineHeight = isTextRow ? PDF_CHART.lineHeight : 10;
    return { ...row, fontSize, lineHeight, height: 4 + lineHeight * Math.max(1, ...cells.map(cell => cell[row.key]?.length ?? 1)) };
  });
  const ticks = buildTempTicks(temperatureRange.minTemp, temperatureRange.maxTemp);
  // 5 mm per tenth in the usual range. The 80 mm ceiling accommodates wide
  // ranges plus three five-line rows on one A4 page, without hiding any points.
  // This depends only on the cycle range, never on fitting two blocks on a page.
  const graphHeight = Math.min(80, (temperatureRange.maxTemp - temperatureRange.minTemp) * 10 * 5) * 72 / 25.4;
  const chartTop = 16;
  return {
    ...temperatureRange, cells, rows, notes, ticks, chartTop, graphHeight,
    width: PDF_CHART.width, colW: (PDF_CHART.width - PDF_CHART.labelWidth) / PDF_CHART.slots,
    height: chartTop + graphHeight + rows.reduce((sum, row) => sum + row.height, 0) + 12,
    points: entries.map(resolveTemperaturePoint).filter(Boolean),
  };
};

const FertilityChartPdf = ({ entries = [], includeRs = true, temperatureRange, layout: prepared }) => {
  const layout = prepared ?? preparePdfChart(entries, includeRs, temperatureRange);
  const left = PDF_CHART.labelWidth;
  const right = left + entries.length * layout.colW;
  const bottom = layout.chartTop + layout.graphHeight;
  const getX = index => left + (index + 0.5) * layout.colW;
  const getY = temp => bottom - (temp - layout.minTemp) / (layout.maxTemp - layout.minTemp) * layout.graphHeight;
  const { mainPath, gapConnectorPath } = buildTemperaturePaths(layout.points, getX, getY);
  // Keep every tenth as a grid line; only space labels out for exceptional ranges.
  const tickLabelStep = Math.max(1, Math.ceil(10 / (layout.graphHeight / ((layout.maxTemp - layout.minTemp) * 10))));
  let rowY = bottom;
  const boardBottom = layout.height - 12;
  const monthChanges = entries.map((entry, index) => index > 0 &&
    formatDateShort(entry).slice(-2) !== formatDateShort(entries[index - 1]).slice(-2));
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={layout.width} height={layout.height} viewBox={`0 0 ${layout.width} ${layout.height}`} fontFamily="Arial, sans-serif" fontSize="8">
      <defs><pattern id="spotting-pattern-pdf" patternUnits="userSpaceOnUse" width="4" height="4"><rect width="4" height="4" fill="#fb7185" /><circle cx="2" cy="2" r="0.8" fill="#fff" /></pattern></defs>
      <rect width={layout.width} height={layout.height} fill="#fff" />
      <defs><clipPath id="pdf-board-clip"><rect x="0.4" y="0.4" width={right - 0.8} height={boardBottom - 0.8} rx="3" /></clipPath></defs>
      <g clipPath="url(#pdf-board-clip)">
      <rect width={right} height={boardBottom} fill={chartTheme.palette.chartBoard} />
      <text x="2" y="9" fill={PALETTE.textStrong} fontWeight="bold">Temperatura °C</text>
      {layout.ticks.map((tick, index) => <g key={tick}>
        <line x1={left} x2={right} y1={getY(tick)} y2={getY(tick)} stroke={Math.round(tick * 10) % 5 === 0 ? '#DBAEBE' : '#E9D6DD'} strokeWidth={Math.round(tick * 10) % 5 === 0 ? 0.6 : 0.35} />
        {index % tickLabelStep === 0 && <text x={left - 5} y={Math.min(bottom - 2, getY(tick) + 2.5)} textAnchor="end" fontWeight={Math.round(tick * 10) % 5 === 0 ? 600 : 400} fill={Math.round(tick * 10) % 5 === 0 ? chartTheme.grid.labelMajor : chartTheme.grid.labelMinor}>{tick.toFixed(2).replace('.', ',')}</text>}
      </g>)}
      {entries.map((entry, i) => <line key={i} x1={getX(i)} x2={getX(i)} y1={layout.chartTop} y2={bottom} stroke={chartTheme.grid.vertical} strokeWidth="0.35" />)}
      <rect x={left} y={layout.chartTop} width={right - left} height={layout.graphHeight} fill="none" stroke={chartTheme.background.rowsSeparator} strokeWidth="0.5" />
      {gapConnectorPath && <path data-path="gaps" d={gapConnectorPath} fill="none" stroke={chartTheme.temperature.gapStroke} strokeWidth="1" strokeDasharray="3 2" />}
      {mainPath && <path data-path="continuous" d={mainPath} fill="none" stroke={PALETTE.tempLine} strokeWidth="1.3" strokeLinejoin="round" />}
      {layout.points.map(point => <g key={point.index}>
        {point.hasCorrection && <>
          <line x1={getX(point.index)} x2={getX(point.index)} y1={getY(point.raw)} y2={getY(point.displayTemperature)} stroke="#677586" strokeWidth="0.7" strokeDasharray="2 2" />
          <circle cx={getX(point.index)} cy={getY(point.raw)} r="1.7" fill="#fff" stroke="#677586" strokeWidth="0.8" />
        </>}
        <circle data-ignored={point.ignored} cx={getX(point.index)} cy={getY(point.displayTemperature)} r="2" fill={point.ignored ? '#e1e5eb' : PALETTE.tempPoint} stroke={point.ignored ? '#586779' : '#fff'} strokeWidth="0.65" />
      </g>)}
      {layout.rows.map((row, rowIndex) => {
        const y = rowY; rowY += row.height;
        const accent = ROW_ACCENTS[row.key];
        const dayRow = row.key === 'cycleDay';
        const dateRow = row.key === 'date';
        return <g key={row.key}>
          <rect x="0" y={y} width={left} height={row.height} fill={chartTheme.palette.softRail} stroke={chartTheme.background.rowsSeparator} strokeWidth="0.35" />
          {accent && <line x1="1" x2="1" y1={y + 2} y2={y + row.height - 2} stroke={accent.color} strokeWidth="1.2" />}
          <text x="4" y={y + row.height / 2} dominantBaseline="central" fontSize="7.5" fontWeight="bold" fill={PALETTE.textStrong}>{row.label}</text>
          <rect x={left} y={y} width={right - left} height={row.height} fill={dayRow ? chartTheme.palette.chartSoftBackground : dateRow || rowIndex % 2 ? chartTheme.palette.chartRows : '#fff'} stroke={chartTheme.background.rowsSeparator} strokeWidth="0.35" />
          {entries.map((entry, i) => {
            const lines = layout.cells[i][row.key] ?? [];
            const peak = getEntryPeakStatus(entry);
            return <g key={i}>
              <line x1={left + i * layout.colW} x2={left + i * layout.colW} y1={y} y2={y + row.height} stroke={dateRow && monthChanges[i] ? chartTheme.grid.horizontalMajor : chartTheme.background.rowsSeparator} strokeWidth={dateRow && monthChanges[i] ? 0.9 : 0.35} />
              {row.key === 'fertility_symbol' ? <>
                {drawSymbol({ entry, x: getX(i), y: y + row.height / 2, width: layout.colW - 5, height: 8 })}
                {peak && <text x={getX(i)} y={y + row.height / 2 + 2.8} fontWeight="bold" textAnchor="middle" fill={PALETTE.textStrong} stroke="#fff" strokeWidth="1.5" paintOrder="stroke">{peak === 'P' ? 'X' : `+${peak}`}</text>}
              </> : row.key === 'had_relations' ? (
                toSafeBool(entry.had_relations) && <Heart x={getX(i) - 4} y={y + row.height / 2 - 4} width={8} height={8} color={PALETTE.tempLine} fill={PALETTE.tempLine} aria-label="Relación registrada" />
              ) : lines.map((line, j) => <text key={j} x={getX(i)} y={y + row.height / 2 - (lines.length - 1) * row.lineHeight / 2 + j * row.lineHeight} dominantBaseline="central" fontSize={row.fontSize} fontWeight={dayRow || dateRow ? 600 : 400} textAnchor="middle" fill={dayRow ? PALETTE.textStrong : dateRow ? '#64748b' : PALETTE.text}>{line}</text>)}
            </g>;
          })}
        </g>;
      })}
      </g>
      <rect x="0.4" y="0.4" width={right - 0.8} height={boardBottom - 0.8} rx="3" fill="none" stroke={chartTheme.background.rowsSeparator} strokeWidth="0.6" />
      {/* Keep the existing bottom space as breathing room before annotations,
          without changing the image dimensions or pagination. */}
    </svg>
  );
};

export default FertilityChartPdf;
