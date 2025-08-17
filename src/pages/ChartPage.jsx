import React, { useEffect, useState } from 'react';
import FertilityChart from '@/components/FertilityChart';
import { useCycleData } from '@/hooks/useCycleData';
import { Button } from '@/components/ui/button';
import { Eye, EyeOff } from 'lucide-react';

const ChartPage = () => {
  const { currentCycle } = useCycleData();
    // Guarda la orientación actual de la pantalla
  const [orientation, setOrientation] = useState('portrait');
    // Controla si mostramos la interpretación del gráfico
  const [showInterpretation, setShowInterpretation] = useState(false);

  useEffect(() => {
        // Cuando cambia el tamaño u orientación del dispositivo actualizamos el estado
    const handleResize = () => {
      setOrientation(window.innerWidth > window.innerHeight ? 'landscape' : 'portrait');
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, []);

  if (!currentCycle?.id) {
    return <p className="text-center text-gray-500">No hay ciclo activo.</p>;
  }

  return (
    <div className="w-full h-full relative">
      <FertilityChart
        data={currentCycle.data || []}
        isFullScreen={true}
        orientation={orientation}
        cycleId={currentCycle.id}
        visibleDays={10} // Muestra siempre 10 días como en la vista de pantalla completa original
        showInterpretation={showInterpretation}
      />
            <Button
        onClick={() => setShowInterpretation(v => !v)}
        variant="ghost"
        size="sm"
        className="absolute top-4 right-4 flex items-center font-semibold py-1 px-2 rounded-lg"
      >
        {showInterpretation ? (
          <EyeOff className="mr-2 h-4 w-4" />
        ) : (
          <Eye className="mr-2 h-4 w-4" />
        )}
        {showInterpretation ? 'Ocultar' : 'Interpretar'}
      </Button>
    </div>
  );
};

export default ChartPage;