import React, { useMemo } from 'react';
import { getSymbolAppearance, getSymbolColorPalette } from '@/config/fertilitySymbols';

const PALETTE = {
  pageBg: '#fff8fb',
  panelBg: '#ffffff',
  panelBorder: '#f6dce6',
  chartBg: '#fffafd',
  chartBorder: '#f2cad7',
  gridMajor: '#f6ccd9',
  gridMinor: '#fde9f0',
  verticalMajor: '#f8dbe5',
  verticalMinor: '#fcedf3',
  textStrong: '#8f1a55',
  text: '#546174',
  textMuted: '#7c889b',
  tempLine: '#e25576',
  tempLineHalo: '#f9a8be',
  tempPoint: '#e25576',
  rowHeaderBg: '#fdeaf2',
  rowBorder: '#f0d5df',
  rowAlt: '#fffafd',
};

const TEXT_RULES = {
  date: { maxLines: 1, maxCharsBase: 11 },
  cycleDay: { maxLines: 1, maxCharsBase: 6 },
  fertility_symbol: { maxLines: 2, maxCharsBase: 12 },
  mucusSensation: { maxLines: 3, maxCharsBase: 20 },
  mucusAppearance: { maxLines: 3, maxCharsBase: 20 },
  observations: { maxLines: 4, maxCharsBase: 24 },
  had_relations: { maxLines: 1, maxCharsBase: 4 },
};

const resolveTemperature = (entry) => {
  const value =
    entry?.displayTemperature ??
    entry?.temperature_chart ??
    entry?.temperature_corrected ??
    entry?.temperature_raw ??
    null;
  const parsed = Number(String(value).replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
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

const FertilityChartPdf = ({ entries = [], width = 1600, height = 900, title = '', includeRs = true }) => {
  const layout = useMemo(() => {
    const margin = { top: 20, right: 24, bottom: 18, left: 24 };
    const panelPadding = 14;
    const titleH = 30;

    const panelInnerH = height - margin.top - margin.bottom - panelPadding * 2 - titleH;
    const graphAreaH = Math.round(panelInnerH * 0.3);
    const rowsAreaH = panelInnerH - graphAreaH;

    const rows = [
      { key: 'date', label: 'Fecha', minHeight: 21, lineHeight: 11, paddingY: 5 },
      { key: 'cycleDay', label: 'Día', minHeight: 21, lineHeight: 11, paddingY: 5 },
      { key: 'fertility_symbol', label: 'Símbolo', minHeight: 25, lineHeight: 10, paddingY: 5 },
      { key: 'mucusSensation', label: 'Sensación', minHeight: 24, lineHeight: 11, paddingY: 5 },
      { key: 'mucusAppearance', label: 'Apariencia', minHeight: 24, lineHeight: 11, paddingY: 5 },
      { key: 'observations', label: 'Observaciones', minHeight: 27, lineHeight: 11, paddingY: 6 },
    ];

    if (includeRs) rows.push({ key: 'had_relations', label: 'RS', minHeight: 21, lineHeight: 11, paddingY: 5 });

    const temperatures = entries.map(resolveTemperature).filter((v) => v !== null);
    const safeMin = temperatures.length ? Math.min(...temperatures) : 36;
    const safeMax = temperatures.length ? Math.max(...temperatures) : 37;
    const minTemp = Math.floor((safeMin - 0.2) * 10) / 10;
    const maxTemp = Math.ceil((safeMax + 0.2) * 10) / 10;

    const dayCount = Math.max(1, entries.length);
    const chartLeft = margin.left + panelPadding + 88;
    const chartRight = width - margin.right - panelPadding;
    const chartW = chartRight - chartLeft;
    const colW = chartW / dayCount;

    const panelX = margin.left;
    const panelY = margin.top;
    const panelW = width - margin.left - margin.right;
    const panelH = height - margin.top - margin.bottom;

    const titleY = panelY + panelPadding + 8;
    const chartTop = panelY + panelPadding + titleH;
    const chartBottom = chartTop + graphAreaH;
    const rowsTop = chartBottom;
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
    const rowsBottom = Math.min(panelY + panelPadding + titleH + graphAreaH + rowsAreaH, rowsTop + rowsContentH);

    return {
      margin,
      panelPadding,
      panelX,
      panelY,
      panelW,
      panelH,
      titleY,
      graphAreaH,
      rowsAreaH,
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
    };
  }, [entries, height, includeRs, width]);

  const tempRange = Math.max(layout.maxTemp - layout.minTemp, 0.1);
  const getX = (index) => layout.chartLeft + layout.colW * (index + 0.5);
  const getY = (temperature) =>
    layout.chartBottom - ((temperature - layout.minTemp) / tempRange) * layout.graphAreaH;

  const points = entries
    .map((entry, index) => ({ index, temperature: resolveTemperature(entry) }))
    .filter((point) => point.temperature !== null);

  const path = points
    .map((point, idx) => `${idx === 0 ? 'M' : 'L'} ${getX(point.index)} ${getY(point.temperature)}`)
    .join(' ');

  let rowCursor = layout.rowsTop;

  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
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

      <rect x="0" y="0" width={width} height={height} fill={PALETTE.pageBg} />
      <rect
        x={layout.panelX}
        y={layout.panelY}
        width={layout.panelW}
        height={layout.panelH}
        rx="16"
        fill={PALETTE.panelBg}
        stroke={PALETTE.panelBorder}
      />

      <text x={layout.chartLeft} y={layout.titleY} fontSize="20" fontWeight="700" fill={PALETTE.textStrong}>
        {title}
      </text>

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
              fontSize="11"
              textAnchor="end"
              fill={major ? PALETTE.text : PALETTE.textMuted}
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

      <text x={layout.margin.left + 18} y={layout.chartTop + 14} fontSize="12" fontWeight="600" fill={PALETTE.textStrong}>
        Temperatura (°C)
      </text>

      {path ? (
         <>
          <path
            d={path}
            fill="none"
            stroke={PALETTE.tempLineHalo}
            strokeOpacity="0.8"
            strokeWidth="5.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d={path}
            fill="none"
            stroke="url(#pdf-temp-line-gradient)"
            strokeWidth="2.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      ) : null}

      {points.map((point) => {
        const cx = getX(point.index);
        const cy = getY(point.temperature);
        return (
          <g key={`p-${point.index}`}>
            <circle cx={cx} cy={cy} r="5.2" fill="#ffffff" fillOpacity="0.96" />
            <circle cx={cx} cy={cy} r="4.4" fill={PALETTE.tempPoint} stroke="#ffffff" strokeWidth="1.4" />
            <circle cx={cx - 0.9} cy={cy - 1} r="1.2" fill="#ffe4ec" fillOpacity="0.95" />
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
            <text x={layout.margin.left + layout.panelPadding + 10} y={y + rowH / 2 + 4} fontSize="13" fontWeight="700" fill={PALETTE.text}>
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
              const textStartY = y + Math.max(14, rowH / 2 - ((lines.length - 1) * lineGap) / 2);

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
                        fontSize="11"
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