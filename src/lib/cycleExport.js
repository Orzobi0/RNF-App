import { processCycleEntries } from '@/lib/cycleDataHandler';
import { computePeakStatuses } from '@/lib/computePeakStatuses';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { getSymbolAppearance } from '@/config/fertilitySymbols';


const cycleHeaders = [
  'Fecha',
  'Día ciclo',
  'Temperatura',
  'Sensación',
  'Apariencia',
  'Símbolo',
  'Obs',
  'Día pico',
  'RS',

];

const parseDateOnly = (value) => {
  if (!value) return null;
  if (value instanceof Date) return new Date(value.getFullYear(), value.getMonth(), value.getDate());

  const str = String(value).trim();

  // YYYY-MM-DD (ISO date-only) -> crear fecha LOCAL (sin líos de zona horaria)
  const iso = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    const y = Number(iso[1]);
    const m = Number(iso[2]) - 1;
    const d = Number(iso[3]);
    return new Date(y, m, d);
  }

  // DD/MM/YYYY o D/M/YYYY
  const dmy = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (dmy) {
    const d = Number(dmy[1]);
    const m = Number(dmy[2]) - 1;
    let y = Number(dmy[3]);
    if (y < 100) y += 2000;
    return new Date(y, m, d);
  }

  // Último recurso: intentar parsear si viene ISO con hora (2025-11-01T...)
  const parsed = new Date(str);
  if (!Number.isNaN(parsed.getTime())) {
    return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
  }

  return null;
};

const formatDate = (value) => {
  const parsed = parseDateOnly(value);
  if (!parsed) return value ? String(value) : '';

  const day = String(parsed.getDate()).padStart(2, '0');
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const year = parsed.getFullYear();
  return `${day}/${month}/${year}`;
};
const formatDayMonth = (value) => {
  const parsed = parseDateOnly(value);
  if (!parsed) return value ? String(value) : '';
  const day = String(parsed.getDate()).padStart(2, '0');
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  return `${day}/${month}`;
};

const formatFertilitySymbolLabel = (symbolValue) => {
  if (!symbolValue || symbolValue === 'none') return '';
  const appearance = getSymbolAppearance(symbolValue);
  if (!appearance || appearance.value === 'none') return '';
  return appearance.label ?? '';
};

const resolveSelectedTemperature = (entry) => {
  const measurements = Array.isArray(entry?.measurements) ? entry.measurements : [];
  const selectedMeasurement =
    measurements.find((measurement) => measurement?.selected) ||
    (entry?.temperature_chart || entry?.temperature_raw || entry?.temperature_corrected
      ? {
          temperature: entry?.temperature_chart ?? entry?.temperature_raw ?? null,
          temperature_corrected: entry?.temperature_corrected ?? null,
          use_corrected: entry?.use_corrected ?? false,
        }
      : null);

  const usesCorrected = selectedMeasurement?.use_corrected ?? entry?.use_corrected ?? false;
  const correctedTemp = selectedMeasurement?.temperature_corrected ?? entry?.temperature_corrected ?? null;
  const rawTemp =
    selectedMeasurement?.temperature ?? entry?.temperature_chart ?? entry?.temperature_raw ?? null;
  const resolvedTemp =
    usesCorrected && correctedTemp !== null && correctedTemp !== undefined && correctedTemp !== ''
      ? correctedTemp
      : rawTemp ?? correctedTemp;

    if (resolvedTemp === null || resolvedTemp === undefined || resolvedTemp === '') {
    return '';
  }

  const suffix =
    usesCorrected && correctedTemp !== null && correctedTemp !== undefined && correctedTemp !== ''
      ? '*'
      : '';

  const asNumber = Number(String(resolvedTemp).replace(',', '.'));
  const formatted = Number.isFinite(asNumber) ? asNumber.toFixed(2) : String(resolvedTemp);

  return `${formatted}${suffix}`;

};

const formatPeakStatus = (entry, peakStatuses) => {
  const status = peakStatuses?.[entry?.isoDate ?? ''] ?? null;
  if (status === 'P' || entry?.peak_marker === 'peak') {
    return 'Día pico';
  }
  if (status === '1' || status === '2' || status === '3') {
    return `+${status}`;
  }
  return '';
};

const ensureProcessedEntries = (cycle) => {
  const startDate = cycle?.startDate ?? null;
  if (Array.isArray(cycle?.data) && cycle.data.every((entry) => entry.cycleDay !== undefined)) {
    return cycle.data;
  }
  return processCycleEntries(cycle?.data || [], startDate);
};

const toIsoLocal = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const buildFullTimelineEntries = (cycle, baseEntries = []) => {
  const base = Array.isArray(baseEntries) ? baseEntries : [];
  const start = parseDateOnly(cycle?.startDate ?? base[0]?.isoDate);
  const end = parseDateOnly(cycle?.endDate ?? base[base.length - 1]?.isoDate);
  if (!start || !end) return base;

  const byIso = new Map(
    base
      .filter((e) => e?.isoDate)
      .map((e) => [e.isoDate, e]),
  );

  const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate(), 12);
  const endNoon = new Date(end.getFullYear(), end.getMonth(), end.getDate(), 12);

  const result = [];
  let dayIndex = 1;

  while (cursor <= endNoon) {
    const isoDate = toIsoLocal(cursor);
    const existing = byIso.get(isoDate);
    const resolvedDate = existing?.date ?? formatDayMonth(existing?.isoDate ?? isoDate);

    result.push(
      existing
        ? {
            ...existing,
            id: existing.id ?? `entry-${isoDate}`,
            cycleDay: existing.cycleDay ?? dayIndex,
            date: resolvedDate,
          }
        : {
            id: `placeholder-${isoDate}`,
            isoDate,
            cycleDay: dayIndex,
            date: formatDayMonth(isoDate),
          },
    );

    cursor.setDate(cursor.getDate() + 1);
    dayIndex += 1;
  }

  return result;
};



const inferCycleTitle = (cycle, index) => {
  const formattedStart = formatDate(cycle?.startDate);
  const formattedEnd = formatDate(cycle?.endDate);

  if (formattedStart && formattedEnd) return `Ciclo ${formattedStart} - ${formattedEnd}`;
  if (formattedStart) return `Ciclo ${formattedStart}`;
  if (cycle?.name) return cycle.name;
  if (cycle?.type === 'current') return 'Ciclo actual';
  if (cycle?.id) return `Ciclo ${cycle.id}`;
  return `Ciclo ${index + 1}`;
};

const escapeCsvField = (value) => {
  if (value === null || value === undefined) return '';
  const stringValue = String(value);
  const sanitized = stringValue.replace(/"/g, '""');
  if (/[",\n]/.test(stringValue)) {
    return `"${sanitized}"`;
  }
  return sanitized;
};

const triggerDownload = (blob, filename) => {
  if (typeof window === 'undefined') return;
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

export const formatCyclesForExport = (cycles = [], { includeRs = true } = {}) => {
  if (!Array.isArray(cycles)) return [];

  return cycles.map((cycle, index) => {
const baseEntries = ensureProcessedEntries(cycle) ?? [];         // solo días con datos reales
const processedEntries = buildFullTimelineEntries(cycle, baseEntries); // todos los días (incl. vacíos)
const peakStatuses = computePeakStatuses(baseEntries);           // calcula picos solo con datos reales

    const rows = processedEntries.map((entry) => [
      formatDate(entry?.isoDate ?? entry?.date),
      entry?.cycleDay ?? '',
      resolveSelectedTemperature(entry),
      entry?.mucusSensation ?? '',
      entry?.mucusAppearance ?? '',
      formatFertilitySymbolLabel(entry?.fertility_symbol),
      entry?.observations ?? '',
      formatPeakStatus(entry, peakStatuses),
      includeRs && entry?.had_relations ? 'Sí' : '',

    ]);

    return {
      cycleId: cycle?.id ?? `cycle-${index + 1}`,
      title: inferCycleTitle(cycle, index),
      headers: cycleHeaders,
      rows,
    };
  });
};

export const downloadCyclesAsCsv = (cycles, filename = 'ciclos.csv', { includeRs = true } = {}) => {
  const formatted = formatCyclesForExport(cycles, { includeRs });
  if (!formatted.length) return;

  const csvSections = formatted.map((cycle) => {
    const headerLine = cycle.headers.map(escapeCsvField).join(',');
    const rowLines = cycle.rows.map((row) => row.map(escapeCsvField).join(','));
    return [`"${cycle.title}"`, headerLine, ...rowLines].join('\n');
  });

  const csvContent = csvSections.join('\n\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  triggerDownload(blob, filename);
};

const buildChartData = (entries = []) => {
  return entries
    .map((entry, index) => {
      const temperature =
        entry?.temperature_chart ?? entry?.temperature_corrected ?? entry?.temperature_raw ?? null;
      const numericTemp =
        temperature !== null && temperature !== undefined && temperature !== ''
          ? Number(temperature)
          : null;
      if (!Number.isFinite(numericTemp)) return null;
      const cycleDay = Number.isFinite(Number(entry?.cycleDay)) ? Number(entry.cycleDay) : index + 1;
      return { cycleDay, temperature: numericTemp };
    })
    .filter(Boolean)
    .sort((a, b) => a.cycleDay - b.cycleDay);
};

const getTempTicks = (minTemp, maxTemp) => {
  const tempRange = Math.max(maxTemp - minTemp, 0.1);
  const tickIncrement = tempRange <= 2.5 ? 0.1 : 0.5;
  const ticks = [];

  for (let t = minTemp; t <= maxTemp + 1e-9; t += tickIncrement) {
    ticks.push(Number(t.toFixed(1)));
  }

  return ticks;
};

const getDayTickStep = (dayRange) => {
  if (dayRange <= 14) return 1;
  if (dayRange <= 30) return 2;
  if (dayRange <= 45) return 3;
  if (dayRange <= 60) return 4;
  return 5;
};

const renderCycleChart = (doc, cycleTitle, entries) => {
  const chartData = buildChartData(entries);
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;
  const chartTop = 34;
  const chartLeft = margin + 16;
  const chartRight = pageWidth - margin - 6;
  const chartBottom = pageHeight - 24;
  const chartWidth = chartRight - chartLeft;
  const chartHeight = chartBottom - chartTop;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(`${cycleTitle} · Gráfica`, margin, 20);
  doc.setFont('helvetica', 'normal');

  if (!chartData.length) {
    doc.setFontSize(11);
    doc.text('No hay datos de temperatura para graficar.', margin, chartTop);
    return;
  }

  const temperatures = chartData.map((point) => point.temperature);
  const rawMinTemp = Math.min(...temperatures);
  const rawMaxTemp = Math.max(...temperatures);
  const paddedMin = rawMinTemp - 0.1;
  const paddedMax = rawMaxTemp + 0.1;
  const minTemp = Number(paddedMin.toFixed(1));
  const maxTemp = Number(paddedMax.toFixed(1));
  const tempRange = Math.max(maxTemp - minTemp, 0.1);
  const minDay = Math.min(...chartData.map((point) => point.cycleDay));
  const maxDay = Math.max(...chartData.map((point) => point.cycleDay));
  const dayRange = Math.max(maxDay - minDay, 1);

  const getX = (day) => chartLeft + ((day - minDay) / dayRange) * chartWidth;
  const getY = (temp) => chartBottom - ((temp - minTemp) / tempRange) * chartHeight;

  doc.setDrawColor(255, 237, 242);
  doc.setFillColor(255, 248, 250);
  doc.rect(chartLeft, chartTop, chartWidth, chartHeight, 'FD');

  const tempTicks = getTempTicks(minTemp, maxTemp);
  tempTicks.forEach((tick) => {
    const y = getY(tick);
    const isMajor = tick.toFixed(1).endsWith('.0') || tick.toFixed(1).endsWith('.5');
    doc.setDrawColor(isMajor ? 244 : 252, isMajor ? 114 : 228, isMajor ? 182 : 196);
    doc.setLineWidth(isMajor ? 0.4 : 0.2);
    doc.line(chartLeft, y, chartRight, y);

    doc.setFontSize(8);
    doc.setTextColor(isMajor ? 190 : 219, isMajor ? 24 : 39, isMajor ? 93 : 119);
    doc.text(tick.toFixed(1), chartLeft - 2.5, y + 2, { align: 'right' });
  });

  const dayStep = getDayTickStep(dayRange);
  for (let day = minDay; day <= maxDay; day += dayStep) {
    const x = getX(day);
    doc.setDrawColor(252, 228, 236);
    doc.setLineWidth(0.2);
    doc.line(x, chartTop, x, chartBottom);
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text(String(day), x, chartBottom + 5, { align: 'center' });
  }

  doc.setDrawColor(216, 92, 112);
  doc.setLineWidth(0.6);
  doc.rect(chartLeft, chartTop, chartWidth, chartHeight);

  doc.setFontSize(9);
  doc.setTextColor(148, 16, 89);
  doc.text('Temperatura (°C)', chartLeft, chartTop - 6);
  doc.setTextColor(148, 163, 184);
  doc.text('Día del ciclo', (chartLeft + chartRight) / 2, chartBottom + 10, {
    align: 'center',
  });

  doc.setDrawColor(216, 92, 112);
  doc.setLineWidth(0.9);
  chartData.forEach((point, index) => {
    const x = getX(point.cycleDay);
    const y = getY(point.temperature);
    if (index > 0) {
      const prev = chartData[index - 1];
      doc.line(getX(prev.cycleDay), getY(prev.temperature), x, y);
    }
    doc.setFillColor(216, 92, 112);
    doc.circle(x, y, 0.8, 'F');
  });
};

export const downloadCyclesAsPdf = async (
  cycles,
  filename = 'ciclos.pdf',
  { includeChart = true, includeRs = true } = {},
) => {
  const formatted = formatCyclesForExport(cycles, { includeRs });
  if (!formatted.length) return;

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const horizontalMargin = 14;
  const tableWidth = doc.internal.pageSize.getWidth() - horizontalMargin * 2;
  const columnWidthRatios = {
    0: 0.08, // Fecha (menos)
    1: 0.06, // Día ciclo
    2: 0.09, // Temperatura
    3: 0.17, // Sensación (más)
    4: 0.17, // Apariencia (más)
    5: 0.10, // Símbolo
    6: 0.18, // Obs (menos)
    7: 0.10, // Día pico (menos)
    8: 0.05, // RS
  };
  const computedColumnStyles = Object.fromEntries(
    Object.entries(columnWidthRatios).map(([index, ratio]) => [
      Number(index),
      {
        cellWidth: tableWidth * ratio,
        minCellWidth: tableWidth * ratio * 0.9,
      },
    ]),
  );

  for (let index = 0; index < formatted.length; index += 1) {
    const cycle = formatted[index];
    if (index > 0) {
      doc.addPage();
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text(cycle.title, horizontalMargin, 24);
    doc.setFont('helvetica', 'normal');

    autoTable(doc, {
      head: [cycle.headers],
      body: cycle.rows,
      margin: { top: 32, left: horizontalMargin, right: horizontalMargin, bottom: 14 },
      tableWidth,
      styles: {
        fontSize: 7,
        cellPadding: { top: 1.6, right: 1.6, bottom: 1.6, left: 1.6 },
        overflow: 'linebreak',
        cellWidth: 'wrap',
        halign: 'left',
        valign: 'top',
      },
      headStyles: { fillColor: [216, 92, 112], textColor: [255, 255, 255], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [255, 232, 238] },
      columnStyles: computedColumnStyles,

      didDrawPage: () => {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(16);
        doc.text(cycle.title, horizontalMargin, 24);
        doc.setFont('helvetica', 'normal');
      },
    });

    if (includeChart) {
      const baseEntries = ensureProcessedEntries(cycles[index]) ?? [];
      const fullEntries = buildFullTimelineEntries(cycles[index], baseEntries);
      const chartsPerPage = 2;
const slotGap = 2;

const totalDays = fullEntries?.length ?? 0;

// “Zoom” solo cuando empieza a apretarse de verdad
const isLong = totalDays > 90;     // ajusta 80/90/100 según prefieras
const isVeryLong = totalDays >= 160;

// Días por tramo (menos días = más ancho por día)
const chunkDays = isVeryLong ? 30 : isLong ? 35 : 50;

// Yo quitaría solape para no repetir días (más claro)
const overlapDays = 0;


      doc.setFont('helvetica', 'normal');

      if (!totalDays) {
        doc.addPage();
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(16);
        doc.text(`${cycle.title} · Gráfica`, horizontalMargin, 18);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(11);
        doc.text('No hay datos para graficar.', horizontalMargin, 28);
      } else {
  const segments = [];
  const step = Math.max(1, chunkDays - overlapDays);

  for (let startIndex = 0; startIndex < totalDays; startIndex += step) {
    const endExclusive = Math.min(startIndex + chunkDays, totalDays);
    const fromEntry = fullEntries[startIndex];
    const toEntry = fullEntries[endExclusive - 1];

    segments.push({
      startIndex,
      endExclusive,
      visibleDays: endExclusive - startIndex,
      dayFrom: fromEntry?.cycleDay ?? startIndex + 1,
      dayTo: toEntry?.cycleDay ?? endExclusive,
      isoFrom: fromEntry?.isoDate ?? null,
      isoTo: toEntry?.isoDate ?? null,
    });

    if (endExclusive === totalDays) break;
  }

  // Si el último segmento es muy corto, únelo al anterior
  const minTailDays = 20;

  if (segments.length > 1) {
    const last = segments[segments.length - 1];
    const lastLen = last.endExclusive - last.startIndex;

    if (lastLen < minTailDays) {
      const prev = segments[segments.length - 2];

      prev.endExclusive = last.endExclusive;
      prev.visibleDays = prev.endExclusive - prev.startIndex;
      prev.dayTo = last.dayTo;
      prev.isoTo = last.isoTo;

      segments.pop();
    }
  }

  try {
    const { renderCycleChartToPng } = await import('@/lib/exportCycleChartImage');

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 2;
    const titleY = 10;
    const contentTop = 12;
    const bottom = 3;
    const contentW = pageWidth - margin * 2;
    const availableH = pageHeight - contentTop - bottom;
    const slotH = (availableH - slotGap * (chartsPerPage - 1)) / chartsPerPage;

    const targetDpi = 300;
    const mmToIn = (mm) => mm / 25.4;

    let segIdx = 0;
    while (segIdx < segments.length) {
      doc.addPage();
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(16);
      doc.text(`${cycle.title} · Gráfica`, margin, titleY);
      doc.setFont('helvetica', 'normal');

      for (let slot = 0; slot < chartsPerPage && segIdx < segments.length; slot += 1) {
        const seg = segments[segIdx];
        segIdx += 1;

        const slotY = contentTop + slot * (slotH + slotGap);
        const subtitleY = slotY + 4;
        const imgAreaTop = slotY + 6;
        const imgAreaH = slotH - 7;

        const datePart =
          seg.isoFrom && seg.isoTo ? ` (${formatDate(seg.isoFrom)}–${formatDate(seg.isoTo)})` : '';

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.text(`Días ${seg.dayFrom}–${seg.dayTo}${datePart}`, margin, subtitleY);
        doc.setFont('helvetica', 'normal');

        const segmentEntries = fullEntries.slice(seg.startIndex, seg.endExclusive);
        const daysInSeg = segmentEntries.length;

        const widthPx = Math.round(mmToIn(contentW) * targetDpi);
        const heightFactor = daysInSeg >= 35 ? 0.78 : 0.85;
        const exportHmm = imgAreaH * heightFactor;
        const heightPx = Math.round(mmToIn(exportHmm) * targetDpi);

        const img = await renderCycleChartToPng({
          cycle: cycles[index],
          entries: segmentEntries,
          widthPx,
          heightPx,
          pixelRatio: 1,
          visibleDays: segmentEntries.length,
          initialScrollIndex: 0,
        });

        const imgRatio = img.widthPx / img.heightPx;

        let drawW = contentW;
        let drawH = drawW / imgRatio;

        if (drawH > imgAreaH) {
          drawH = imgAreaH;
          drawW = drawH * imgRatio;
        }

        const x = margin + (contentW - drawW) / 2;
        const y = imgAreaTop + (imgAreaH - drawH) / 2;

        doc.addImage(img.dataUrl, 'PNG', x, y, drawW, drawH);
      }
    }
  } catch (error) {
    console.error('[PDF] Fallo export PNG por segmentos, usando fallback jsPDF:', error);
    doc.addPage();
    renderCycleChart(doc, cycle.title, fullEntries);
  }
}


    }
  }

  const blob = doc.output('blob');
  triggerDownload(blob, filename);
  
};


export default formatCyclesForExport;