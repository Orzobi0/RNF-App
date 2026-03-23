import { processCycleEntries } from '@/lib/cycleDataHandler';
import { computePeakStatuses } from '@/lib/computePeakStatuses';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { getSymbolAppearance } from '@/config/fertilitySymbols';
import { renderCycleChartPdfToPng } from '@/lib/exportCycleChartPdfImage';


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
const PDF_THEME = {
  pageBg: [255, 248, 251],
  panelBg: [255, 255, 255],
  panelBorder: [246, 220, 230],
  headerBg: [253, 234, 242],
  accent: [143, 26, 85],
  accentSoft: [216, 92, 112],
  text: [84, 97, 116],
  muted: [124, 136, 155],
  white: [255, 255, 255],
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
  const isCurrentCycle = !formattedEnd;

  if (formattedStart && formattedEnd) {
    return `Ciclo ${formattedStart} - ${formattedEnd}`;
  }

  if (formattedStart && isCurrentCycle) {
    return `Ciclo ${formattedStart} - actualidad`;
  }

  if (formattedStart) return `Ciclo ${formattedStart}`;
  if (cycle?.name) return cycle.name;
  if (cycle?.id) return `Ciclo ${cycle.id}`;
  return `Ciclo ${index + 1}`;
};

const getCycleDateRangeLabel = (cycle) => {
  const formattedStart = formatDate(cycle?.startDate);
  const formattedEnd = formatDate(cycle?.endDate);
  const isCurrentCycle = !formattedEnd;

  if (formattedStart && formattedEnd) {
    return `${formattedStart} - ${formattedEnd}`;
  }

  if (formattedStart && isCurrentCycle) {
    return `${formattedStart} - actualidad`;
  }

  if (formattedStart) return formattedStart;
  return 'sin fechas';
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
const drawRoundedPanel = (doc, x, y, w, h, radius = 4, style = 'FD') => {
  doc.roundedRect(x, y, w, h, radius, radius, style);
};

const drawPdfPageChrome = (doc, { title, subtitle = '', badge = '' }) => {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // Fondo general
  doc.setFillColor(...PDF_THEME.pageBg);
  doc.rect(0, 0, pageWidth, pageHeight, 'F');

  // Marco exterior suave
  doc.setDrawColor(...PDF_THEME.panelBorder);
  doc.setLineWidth(0.35);
  drawRoundedPanel(doc, 6, 6, pageWidth - 12, pageHeight - 12, 5, 'S');

  // Cabecera
  doc.setFillColor(...PDF_THEME.headerBg);
  drawRoundedPanel(doc, 8, 8, pageWidth - 16, 18, 5, 'F');

  // Título
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(...PDF_THEME.accent);
  doc.text(title, 14, 18);

  // Subtítulo
  if (subtitle) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(...PDF_THEME.muted);
    doc.text(subtitle, 14, 23);
  }

  // Badge derecha
  if (badge) {
    const badgeW = 18;
    const badgeH = 8;
    const badgeX = pageWidth - 14 - badgeW;
    const badgeY = 12;

    doc.setFillColor(...PDF_THEME.accentSoft);
    drawRoundedPanel(doc, badgeX, badgeY, badgeW, badgeH, 3, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...PDF_THEME.white);
    doc.text(badge, badgeX + badgeW / 2, badgeY + 5.4, { align: 'center' });
  }
};

const drawSectionCard = (doc, x, y, w, h) => {
  doc.setFillColor(...PDF_THEME.panelBg);
  doc.setDrawColor(...PDF_THEME.panelBorder);
  doc.setLineWidth(0.3);
  drawRoundedPanel(doc, x, y, w, h, 4, 'FD');
};

const drawSectionTitle = (doc, { x, y, title = '', subtitle = '' }) => {
  let currentY = y;

  if (title) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11.5);
    doc.setTextColor(...PDF_THEME.accent);
    doc.text(title, x, currentY);
    currentY += 5;
  }

  if (subtitle) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...PDF_THEME.muted);
    doc.text(subtitle, x, currentY);
  }
};
const buildFixedChartSegments = (entries = [], maxDaysPerPage = 31, tinyTailThreshold = 10) => {
  const totalDays = entries?.length ?? 0;
  if (!totalDays) return [];

  const segments = [];
  for (let startIndex = 0; startIndex < totalDays; startIndex += maxDaysPerPage) {
    const endExclusive = Math.min(totalDays, startIndex + maxDaysPerPage);
    const fromEntry = entries[startIndex];
    const toEntry = entries[endExclusive - 1];

    segments.push({
      startIndex,
      endExclusive,
      visibleDays: endExclusive - startIndex,
      dayFrom: fromEntry?.cycleDay ?? startIndex + 1,
      dayTo: toEntry?.cycleDay ?? endExclusive,
      isoFrom: fromEntry?.isoDate ?? null,
      isoTo: toEntry?.isoDate ?? null,
    });
    }

  if (segments.length > 1) {
    const last = segments[segments.length - 1];
    const prev = segments[segments.length - 2];
    const lastSize = last.endExclusive - last.startIndex;
    const combined = last.endExclusive - prev.startIndex;

    if (lastSize > 0 && lastSize < tinyTailThreshold && combined <= maxDaysPerPage * 2) {
      const firstSize = Math.min(maxDaysPerPage, Math.ceil(combined / 2));
      const secondSize = combined - firstSize;
      if (secondSize > 0) {
        const firstEndExclusive = prev.startIndex + firstSize;
        const secondStartIndex = firstEndExclusive;
        const firstFromEntry = entries[prev.startIndex];
        const firstToEntry = entries[firstEndExclusive - 1];
        const secondFromEntry = entries[secondStartIndex];
        const secondToEntry = entries[last.endExclusive - 1];

        segments[segments.length - 2] = {
          startIndex: prev.startIndex,
          endExclusive: firstEndExclusive,
          visibleDays: firstEndExclusive - prev.startIndex,
          dayFrom: firstFromEntry?.cycleDay ?? prev.startIndex + 1,
          dayTo: firstToEntry?.cycleDay ?? firstEndExclusive,
          isoFrom: firstFromEntry?.isoDate ?? null,
          isoTo: firstToEntry?.isoDate ?? null,
        };

        segments[segments.length - 1] = {
          startIndex: secondStartIndex,
          endExclusive: last.endExclusive,
          visibleDays: last.endExclusive - secondStartIndex,
          dayFrom: secondFromEntry?.cycleDay ?? secondStartIndex + 1,
          dayTo: secondToEntry?.cycleDay ?? last.endExclusive,
          isoFrom: secondFromEntry?.isoDate ?? null,
          isoTo: secondToEntry?.isoDate ?? null,
        };
      }
    }
  }

  return segments.filter((segment) => segment.visibleDays > 0);
};

const exportChartOnlyPdf = async ({ doc, cycle, formattedCycle, includeRs, horizontalMargin }) => {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const pageMarginX = 8;
  const pageMarginTop = 30;
  const pageMarginBottom = 10;
  const headerGap = 1.5;
  const chartGap = 5;
  const cycleGap = 6;

  let cursorY = pageMarginTop;
  let isFirstPage = true;

  const startNewPage = (pageTitle = 'Gráfica del ciclo') => {
    if (!isFirstPage) doc.addPage();
    isFirstPage = false;

    drawPdfPageChrome(doc, {
      title: pageTitle,
      subtitle: 'Exportación PDF',
      badge: 'FertiliApp',
    });

    cursorY = pageMarginTop;
  };

  const baseEntries = ensureProcessedEntries(cycle) ?? [];
  const fullEntries = buildFullTimelineEntries(cycle, baseEntries);
  const segments = buildFixedChartSegments(fullEntries, 31);
  const cycleRangeLabel = getCycleDateRangeLabel(cycle);

  if (isFirstPage) {
    startNewPage(`Gráfica del ciclo ${cycleRangeLabel}`);
  }

  if (!segments.length) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.setTextColor(...PDF_THEME.text);
    doc.text('No hay datos para graficar.', horizontalMargin, 38);
    return;
  }

  for (let segmentIndex = 0; segmentIndex < segments.length; segmentIndex += 1) {
    const segment = segments[segmentIndex];

    const datePart =
      segment.isoFrom && segment.isoTo
        ? ` (${formatDate(segment.isoFrom)}–${formatDate(segment.isoTo)})`
        : '';

    const contentW = pageWidth - pageMarginX * 2;
    const targetDpi = 280;
    const mmToPx = (mm) => (mm / 25.4) * targetDpi;
    const segmentEntries = fullEntries.slice(segment.startIndex, segment.endExclusive);

    const image = await renderCycleChartPdfToPng({
      entries: segmentEntries,
      title: `${formattedCycle.title} · Días ${segment.dayFrom}–${segment.dayTo}`,
      includeRs,
      widthPx: Math.round(mmToPx(contentW)),
      heightPx: Math.round(mmToPx((pageHeight - pageMarginTop - pageMarginBottom) * 0.9)),
      pixelRatio: 1.75,
      embedded: true,
      showTitle: false,
    });

    const imageHeightMm = contentW * (image.heightPx / image.widthPx);
    const cardTopPad = 6;
    const textToImageGap = 2.5;
    const cardBottomPad = 4;

    const cardH = cardTopPad + textToImageGap + headerGap + imageHeightMm + cardBottomPad;
    const blockHeight = cardH + chartGap;
    const requiredHeight = blockHeight + (segmentIndex === segments.length - 1 ? cycleGap : 0);
    const fitsCurrentPage = cursorY + requiredHeight <= pageHeight - pageMarginBottom;

    if (!fitsCurrentPage) {
      startNewPage(`Gráfica del ciclo ${cycleRangeLabel}`);
    }

    const cardX = pageMarginX;
    const cardY = cursorY;
    const cardW = contentW;
    const cardInnerPad = 4;

    const subtitleY = cardY + cardTopPad;
    const contentY = subtitleY + textToImageGap + headerGap;

    drawSectionCard(doc, cardX, cardY, cardW, cardH);

    drawSectionTitle(doc, {
      x: cardX + cardInnerPad,
      y: subtitleY,
      title: '',
      subtitle: `Días ${segment.dayFrom}–${segment.dayTo}${datePart}`,
    });

    doc.addImage(
      image.dataUrl,
      'PNG',
      cardX + cardInnerPad,
      contentY,
      cardW - cardInnerPad * 2,
      imageHeightMm
    );

    cursorY = cardY + cardH + chartGap;

    if (segmentIndex === segments.length - 1) {
      cursorY += cycleGap;
    }
  }
};
  
export const downloadCyclesAsPdf = async (
  cycles,
  filename = 'ciclos.pdf',
  { includeChart = true, includeRs = true, chartOnly = false } = {},
) => {
  const formatted = formatCyclesForExport(cycles, { includeRs });
  if (!formatted.length) return;

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const horizontalMargin = 14;
  const tableWidth = doc.internal.pageSize.getWidth() - horizontalMargin * 2;

  const columnWidthRatios = {
    0: 0.08,
    1: 0.06,
    2: 0.09,
    3: 0.17,
    4: 0.17,
    5: 0.10,
    6: 0.18,
    7: 0.10,
    8: 0.05,
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

  let hasStarted = false;

  for (let index = 0; index < formatted.length; index += 1) {
    const cycle = cycles[index];
    const formattedCycle = formatted[index];

    if (includeChart) {
      if (hasStarted) {
        doc.addPage();
      }

      await exportChartOnlyPdf({
        doc,
        cycle,
        formattedCycle,
        includeRs,
        horizontalMargin,
      });

      hasStarted = true;
    }

    if (!chartOnly) {
      if (hasStarted) {
        doc.addPage();
      }

      autoTable(doc, {
        head: [formattedCycle.headers],
        body: formattedCycle.rows,
        margin: { top: 34, left: horizontalMargin, right: horizontalMargin, bottom: 14 },
        tableWidth,
        headStyles: {
          fillColor: [216, 92, 112],
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          lineColor: [216, 92, 112],
          lineWidth: 0.15,
        },
        alternateRowStyles: { fillColor: [255, 232, 238] },
        styles: {
          fontSize: 7,
          cellPadding: { top: 1.6, right: 1.6, bottom: 1.6, left: 1.6 },
          overflow: 'linebreak',
          cellWidth: 'wrap',
          halign: 'left',
          valign: 'top',
          textColor: PDF_THEME.text,
          lineColor: PDF_THEME.panelBorder,
          lineWidth: 0.15,
        },
        columnStyles: computedColumnStyles,
        willDrawPage: () => {
          drawPdfPageChrome(doc, {
            title: `Datos del ciclo ${getCycleDateRangeLabel(cycle)}`,
            subtitle: 'Exportación PDF',
            badge: 'DATOS',
          });
        },
      });

      hasStarted = true;
    }
  }

  const blob = doc.output('blob');
  triggerDownload(blob, filename);
};

export default formatCyclesForExport;