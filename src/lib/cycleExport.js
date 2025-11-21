import { processCycleEntries } from '@/lib/cycleDataHandler';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

const cycleHeaders = [
  'ID de ciclo',
  'Inicio de ciclo',
  'Fin de ciclo',
  'ID del registro',
  'Fecha (ISO)',
  'Fecha',
  'Día del ciclo',
  'Temp. sin corregir',
  'Temp. corregida',
  'Temp. gráfico',
  'Usa corregida',
  'Sensación de moco',
  'Aspecto de moco',
  'Símbolo de fertilidad',
  'Observaciones',
  'Relaciones',
  'Ignorado',
  'Marcador pico',
  'Mediciones',
];

const formatMeasurement = (measurement, index) => {
  if (!measurement) return `Medición ${index + 1}: N/D`;
  const parts = [`Medición ${index + 1}`];
  if (measurement.time) parts.push(`hora: ${measurement.time}`);
  if (measurement.temperature !== undefined && measurement.temperature !== null && measurement.temperature !== '') {
    parts.push(`temp: ${measurement.temperature}`);
  }
  if (
    measurement.temperature_corrected !== undefined &&
    measurement.temperature_corrected !== null &&
    measurement.temperature_corrected !== ''
  ) {
    parts.push(`corr: ${measurement.temperature_corrected}`);
  }
  if (measurement.use_corrected) {
    parts.push('usa corregida');
  }
  if (measurement.selected) {
    parts.push('seleccionada');
  }
  return parts.join(' | ');
};

const stringifyMeasurements = (measurements) => {
  if (!Array.isArray(measurements) || measurements.length === 0) {
    return '';
  }
  return measurements.map((measurement, index) => formatMeasurement(measurement, index)).join(' \n ');
};

const ensureProcessedEntries = (cycle) => {
  const startDate = cycle?.startDate ?? null;
  if (Array.isArray(cycle?.data) && cycle.data.every((entry) => entry.cycleDay !== undefined)) {
    return cycle.data;
  }
  return processCycleEntries(cycle?.data || [], startDate);
};

const inferCycleTitle = (cycle, index) => {
  if (cycle?.name) return cycle.name;
  if (cycle?.type === 'current') return 'Ciclo actual';
  if (cycle?.startDate) return `Ciclo ${cycle.startDate}`;
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

export const formatCyclesForExport = (cycles = []) => {
  if (!Array.isArray(cycles)) return [];

  return cycles.map((cycle, index) => {
    const processedEntries = ensureProcessedEntries(cycle) ?? [];
    const rows = processedEntries.map((entry) => [
      cycle?.id ?? '',
      cycle?.startDate ?? '',
      cycle?.endDate ?? '',
      entry?.id ?? '',
      entry?.isoDate ?? '',
      entry?.date ?? '',
      entry?.cycleDay ?? '',
      entry?.temperature_raw ?? '',
      entry?.temperature_corrected ?? '',
      entry?.temperature_chart ?? '',
      entry?.use_corrected ? 'Sí' : 'No',
      entry?.mucusSensation ?? '',
      entry?.mucusAppearance ?? '',
      entry?.fertility_symbol ?? '',
      entry?.observations ?? '',
      entry?.had_relations ? 'Sí' : 'No',
      entry?.ignored ? 'Sí' : 'No',
      entry?.peak_marker ?? '',
      stringifyMeasurements(entry?.measurements),
    ]);

    return {
      cycleId: cycle?.id ?? `cycle-${index + 1}`,
      title: inferCycleTitle(cycle, index),
      headers: cycleHeaders,
      rows,
    };
  });
};

export const downloadCyclesAsCsv = (cycles, filename = 'ciclos.csv') => {
  const formatted = formatCyclesForExport(cycles);
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

export const downloadCyclesAsPdf = (cycles, filename = 'ciclos.pdf') => {
  const formatted = formatCyclesForExport(cycles);
  if (!formatted.length) return;

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const horizontalMargin = 14;
  const tableWidth = doc.internal.pageSize.getWidth() - horizontalMargin * 2;
  const columnWidthRatios = {
    0: 0.05,
    1: 0.075,
    2: 0.075,
    3: 0.055,
    4: 0.065,
    5: 0.05,
    6: 0.035,
    7: 0.045,
    8: 0.045,
    9: 0.045,
    10: 0.035,
    11: 0.045,
    12: 0.045,
    13: 0.045,
    14: 0.05,
    15: 0.09,
    16: 0.035,
    17: 0.045,
    18: 0.12,
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

  formatted.forEach((cycle, index) => {
    if (index > 0) {
      doc.addPage();
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text(cycle.title, horizontalMargin, 24);
    doc.setFont('helvetica', 'normal');

    autoTable(doc, {
      startY: 32,
      head: [cycle.headers],
      body: cycle.rows,
      styles: {
        fontSize: 7,
        cellPadding: { top: 1.6, right: 1.6, bottom: 1.6, left: 1.6 },
        overflow: 'linebreak',
        cellWidth: 'wrap',
        halign: 'left',
        valign: 'top',
      },
      headStyles: { fillColor: [244, 114, 182], textColor: [255, 255, 255], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [252, 242, 248] },
      columnStyles: computedColumnStyles,
      margin: { left: horizontalMargin, right: horizontalMargin },
      tableWidth,
    });
  });

  const blob = doc.output('blob');
  triggerDownload(blob, filename);
};

export default formatCyclesForExport;