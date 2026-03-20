import React, { useMemo } from 'react';
import { getSymbolAppearance } from '@/config/fertilitySymbols';

const PALETTE = {
  background: '#fff7fb',
  panel: '#ffffff',
  gridMajor: '#f7c9d8',
  gridMinor: '#fde6ef',
  border: '#d85c70',
  textStrong: '#8f1a55',
  text: '#475569',
  textSoft: '#64748b',
  tempLine: '#d85c70',
  tempPoint: '#d85c70',
  rowHeaderBg: '#fde8f0',
  rowLine: '#f2d4df',
};

const SYMBOL_SHORT = {
  red: 'S',
  white: 'MF',
  green: 'SE',
  yellow: 'NM',
  spot: 'SP',
};

const wrapText = (text, maxCharsPerLine) => {
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
  return lines;
};

const resolveTemperature = (entry) => {
  const value = entry?.displayTemperature ?? entry?.temperature_chart ?? entry?.temperature_corrected ?? entry?.temperature_raw ?? null;
  const parsed = Number(String(value).replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
};

const buildTempTicks = (minTemp, maxTemp) => {
  const ticks = [];
  for (let t = minTemp; t <= maxTemp + 1e-6; t += 0.1) {
    ticks.push(Number(t.toFixed(1)));
  }
  return ticks;
};

const FertilityChartPdf = ({ entries = [], width = 1600, height = 900, title = '', includeRs = true }) => {
  const layout = useMemo(() => {
    const margin = { top: 20, right: 24, bottom: 20, left: 24 };
    const titleH = 34;
    const dayHeaderH = 62;

    const temperatures = entries.map(resolveTemperature).filter((v) => v !== null);
    const safeMin = temperatures.length ? Math.min(...temperatures) : 36.0;
    const safeMax = temperatures.length ? Math.max(...temperatures) : 37.0;
    const minTemp = Math.floor((safeMin - 0.2) * 10) / 10;
    const maxTemp = Math.ceil((safeMax + 0.2) * 10) / 10;

    const graphAreaH = Math.round((height - margin.top - margin.bottom) * 0.42);
    const rowsAreaH = height - margin.top - margin.bottom - titleH - dayHeaderH - graphAreaH;

    const baseRows = [
      { key: 'mucusSensation', label: 'Sensación' },
      { key: 'mucusAppearance', label: 'Apariencia' },
      { key: 'observations', label: 'Observaciones' },
      { key: 'fertility_symbol', label: 'Símbolo' },
    ];
    if (includeRs) baseRows.push({ key: 'had_relations', label: 'RS' });

    const dayCount = Math.max(entries.length, 1);
    const chartLeft = margin.left + 82;
    const chartRight = width - margin.right;
    const chartW = chartRight - chartLeft;
    const colW = chartW / dayCount;

    const rowWeights = baseRows.map((row) => {
      if (row.key === 'observations') return 2.3;
      if (row.key === 'mucusSensation' || row.key === 'mucusAppearance') return 1.5;
      return 1;
    });

    const totalWeight = rowWeights.reduce((acc, value) => acc + value, 0);
    const rowHeights = rowWeights.map((weight) => (rowsAreaH / totalWeight) * weight);

    return {
      margin,
      titleH,
      dayHeaderH,
      graphAreaH,
      rowsAreaH,
      rows: baseRows,
      rowHeights,
      minTemp,
      maxTemp,
      ticks: buildTempTicks(minTemp, maxTemp),
      chartLeft,
      chartRight,
      chartW,
      colW,
      chartTop: margin.top + titleH,
      chartBottom: margin.top + titleH + graphAreaH,
      rowsTop: margin.top + titleH + graphAreaH + dayHeaderH,
      dayCount,
    };
  }, [entries, height, includeRs, width]);

  const tempRange = Math.max(layout.maxTemp - layout.minTemp, 0.1);
  const getX = (index) => layout.chartLeft + layout.colW * (index + 0.5);
  const getY = (temperature) => layout.chartBottom - ((temperature - layout.minTemp) / tempRange) * layout.graphAreaH;

  const points = entries
    .map((entry, index) => ({ index, temperature: resolveTemperature(entry) }))
    .filter((point) => point.temperature !== null);

  const path = points
    .map((point, idx) => `${idx === 0 ? 'M' : 'L'} ${getX(point.index)} ${getY(point.temperature)}`)
    .join(' ');

  let rowCursor = layout.rowsTop;

  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <rect x="0" y="0" width={width} height={height} fill={PALETTE.background} />
      <rect
        x={layout.margin.left}
        y={layout.margin.top}
        width={width - layout.margin.left - layout.margin.right}
        height={height - layout.margin.top - layout.margin.bottom}
        rx="16"
        fill={PALETTE.panel}
        stroke="#f8d9e6"
      />

      <text x={layout.margin.left + 12} y={layout.margin.top + 22} fontSize="20" fontWeight="700" fill={PALETTE.textStrong}>
        {title}
      </text>

      <rect x={layout.chartLeft} y={layout.chartTop} width={layout.chartW} height={layout.graphAreaH} fill="#fffafb" stroke="#f9d9e4" />

      {layout.ticks.map((tick) => {
        const y = getY(tick);
        const major = Math.abs((tick * 10) % 5) < 1e-9;
        return (
          <g key={`tick-${tick}`}>
            <line x1={layout.chartLeft} y1={y} x2={layout.chartRight} y2={y} stroke={major ? PALETTE.gridMajor : PALETTE.gridMinor} strokeWidth={major ? 1.2 : 0.8} />
            <text x={layout.chartLeft - 8} y={y + 4} fontSize="12" textAnchor="end" fill={major ? PALETTE.text : PALETTE.textSoft}>
              {tick.toFixed(1)}
            </text>
          </g>
        );
      })}

      {entries.map((entry, index) => {
        const x = getX(index);
        const major = entry?.cycleDay ? entry.cycleDay % 2 === 0 : index % 2 === 1;
        return (
          <line key={`v-${entry?.id ?? index}`} x1={x} y1={layout.chartTop} x2={x} y2={layout.chartBottom} stroke={major ? '#f6dae4' : '#fbeaf1'} strokeWidth="0.8" />
        );
      })}

      <rect x={layout.chartLeft} y={layout.chartTop} width={layout.chartW} height={layout.graphAreaH} fill="none" stroke={PALETTE.border} strokeWidth="1.4" />
      <text x={layout.margin.left + 12} y={layout.chartTop + 14} fontSize="13" fontWeight="600" fill={PALETTE.textStrong}>Temperatura (°C)</text>

      {path ? <path d={path} fill="none" stroke={PALETTE.tempLine} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /> : null}
      {points.map((point) => (
        <circle key={`p-${point.index}`} cx={getX(point.index)} cy={getY(point.temperature)} r="4.5" fill={PALETTE.tempPoint} />
      ))}

      {entries.map((entry, index) => {
        const x = getX(index);
        const day = entry?.cycleDay ?? index + 1;
        const date = entry?.date ?? entry?.isoDate ?? '';
        return (
          <g key={`d-${entry?.id ?? index}`}>
            <text x={x} y={layout.chartBottom + 18} fontSize="12" textAnchor="middle" fill={PALETTE.textSoft}>{date}</text>
            <text x={x} y={layout.chartBottom + 38} fontSize="13" fontWeight="600" textAnchor="middle" fill={PALETTE.text}>{`D${day}`}</text>
          </g>
        );
      })}

      {layout.rows.map((row, rowIndex) => {
        const rowH = layout.rowHeights[rowIndex];
        const y = rowCursor;
        rowCursor += rowH;

        return (
          <g key={row.key}>
            <rect x={layout.margin.left} y={y} width={layout.chartLeft - layout.margin.left} height={rowH} fill={PALETTE.rowHeaderBg} stroke={PALETTE.rowLine} />
            <text x={layout.margin.left + 10} y={y + rowH / 2 + 4} fontSize="13" fontWeight="700" fill={PALETTE.text}>{row.label}</text>

            <rect x={layout.chartLeft} y={y} width={layout.chartW} height={rowH} fill="#fff" stroke={PALETTE.rowLine} />

            {entries.map((entry, colIndex) => {
              const x = layout.chartLeft + colIndex * layout.colW;
              const cx = x + layout.colW / 2;
              const isObs = row.key === 'observations';
              const baseText = row.key === 'had_relations' ? (entry?.had_relations ? 'Sí' : '') : row.key === 'fertility_symbol' ? (SYMBOL_SHORT[entry?.fertility_symbol] ?? '') : (entry?.[row.key] ?? '');
              const lines = wrapText(baseText, Math.max(6, Math.floor(layout.colW / (isObs ? 5.8 : 6.8)))).slice(0, isObs ? 6 : 4);
              return (
                <g key={`${row.key}-${entry?.id ?? colIndex}`}>
                  <line x1={x} y1={y} x2={x} y2={y + rowH} stroke={PALETTE.rowLine} strokeWidth="0.8" />
                  {row.key === 'fertility_symbol' ? (
                    <>
                      <text x={cx} y={y + rowH / 2 + 4} fontSize="12" textAnchor="middle" fontWeight="700" fill={PALETTE.text}>{baseText}</text>
                      {entry?.fertility_symbol && entry.fertility_symbol !== 'none' ? (
                        <text x={cx} y={y + rowH - 8} fontSize="10" textAnchor="middle" fill={PALETTE.textSoft}>{getSymbolAppearance(entry.fertility_symbol)?.label ?? ''}</text>
                      ) : null}
                    </>
                  ) : (
                    lines.map((line, lineIndex) => (
                      <text key={`${row.key}-${colIndex}-${lineIndex}`} x={cx} y={y + 16 + lineIndex * 14} fontSize="11" textAnchor="middle" fill={PALETTE.text}>
                        {line}
                      </text>
                    ))
                  )}
                </g>
              );
            })}
            <line x1={layout.chartRight} y1={y} x2={layout.chartRight} y2={y + rowH} stroke={PALETTE.rowLine} strokeWidth="0.8" />
          </g>
        );
      })}
    </svg>
  );
};

export default FertilityChartPdf;