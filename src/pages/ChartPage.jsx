import React, { useEffect, useState } from 'react';
import FertilityChart from '@/components/FertilityChart';
import { useCycleData } from '@/hooks/useCycleData';

const ChartPage = () => {
  const { currentCycle } = useCycleData();
  const [orientation, setOrientation] = useState('portrait');

  useEffect(() => {
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
    <div className="w-full h-full">
      <FertilityChart
        data={currentCycle.data || []}
        isFullScreen={true}
        orientation={orientation}
        cycleId={currentCycle.id}
      />
    </div>
  );
};

export default ChartPage;