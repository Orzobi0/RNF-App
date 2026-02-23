import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

const DataIssuesBanner = ({ issues, onReview }) => {
  if (!issues?.hasIssues) return null;

  return (
    <div className="rounded-2xl border border-amber-300 bg-amber-50 px-3 py-2 text-amber-900 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm">
          <AlertTriangle className="h-4 w-4" />
          <span>
            Hay problemas de datos en este ciclo: {issues.summary.duplicateDaysCount} días con duplicados,
            {' '}{issues.summary.outOfRangeCount} fuera de rango.
          </span>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={onReview}>
          Revisar
        </Button>
      </div>
    </div>
  );
};

export default DataIssuesBanner;