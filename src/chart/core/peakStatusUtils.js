// Pure normalization shared by the current hook and future render model.
export const normalizePeakStatus = (value) => {
  if (value == null) return '';

  const status = String(value).trim().toUpperCase();

  if (status === 'P' || status === 'PEAK') return 'P';
  if (status === '1' || status === 'P1' || status === 'P+1') return '1';
  if (status === '2' || status === 'P2' || status === 'P+2') return '2';
  if (status === '3' || status === 'P3' || status === 'P+3') return '3';

  return '';
};
