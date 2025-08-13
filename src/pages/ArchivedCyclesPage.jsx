
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useCycleData } from '@/hooks/useCycleData';
import { Button } from '@/components/ui/button';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { Archive, Eye, Plus } from 'lucide-react';
import { motion } from 'framer-motion';
import EditCycleDatesDialog from '@/components/EditCycleDatesDialog';

    const ArchivedCyclesPage = () => {
  const { archivedCycles, isLoading, addArchivedCycle } = useCycleData();
  const [showAddDialog, setShowAddDialog] = useState(false);

  const handleAddCycle = ({ startDate, endDate }) => {
    addArchivedCycle(startDate, endDate);
    setShowAddDialog(false);
  };

      if (isLoading) {
        return <div className="text-center text-slate-300 p-8">Cargando ciclos archivados...</div>;
      }

      if (!archivedCycles || archivedCycles.length === 0) {
    return (
      <motion.div
        className="text-center text-slate-400 py-10 flex flex-col items-center"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <Archive className="w-24 h-24 text-slate-500 mb-6" />
        <h2 className="text-2xl font-semibold text-slate-200 mb-4">No hay ciclos archivados</h2>
        <p className="text-lg">Cuando inicies un nuevo ciclo, el anterior aparecerá aquí.</p>
        <div className="flex gap-4 mt-8">
          <Button asChild className="bg-gradient-to-r from-pink-500 to-fuchsia-600 hover:from-pink-600 hover:to-fuchsia-700 text-white">
            <Link to="/">Volver al Ciclo Actual</Link>
          </Button>
          <Button onClick={() => setShowAddDialog(true)} className="bg-pink-600 hover:bg-pink-700 text-white">
            <Plus className="mr-2 h-4 w-4" /> Crear Ciclo
          </Button>
        </div>
        <EditCycleDatesDialog
          isOpen={showAddDialog}
          onClose={() => setShowAddDialog(false)}
          onConfirm={handleAddCycle}
          title="Añadir Ciclo Anterior"
          description="Ingresa las fechas de un ciclo previo para añadir registros."
        />
      </motion.div>
    );
  }
      
      const sortedArchivedCycles = [...archivedCycles].sort(
        (a, b) => parseISO(b.startDate) - parseISO(a.startDate)
      );

      return (
    <div className="w-full max-w-4xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-center mb-8">
        <motion.h1
          className="text-3xl sm:text-4xl font-bold text-slate-500 mb-4 sm:mb-0"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          Mis Ciclos Archivados
        </motion.h1>
        <Button onClick={() => setShowAddDialog(true)} className="bg-pink-600 hover:bg-pink-700 text-white">
          <Plus className="mr-2 h-4 w-4" /> Añadir Ciclo
        </Button>
      </div>
      <motion.ul
        className="space-y-6"
        variants={{
          hidden: { opacity: 0 },
          show: {
            opacity: 1,
            transition: {
              staggerChildren: 0.1
            }
          }
        }}
        initial="hidden"
        animate="show"
      >
            {sortedArchivedCycles.map((cycle) => {
              const endDate = cycle.endDate
                ? format(parseISO(cycle.endDate), "dd MMM yyyy", { locale: es })
                : cycle.data && cycle.data.length > 0
                  ? format(parseISO(cycle.data[cycle.data.length - 1].isoDate), "dd MMM yyyy", { locale: es })
                  : format(parseISO(cycle.startDate), "dd MMM yyyy", { locale: es });
              const recordCount = cycle.data ? cycle.data.length : 0;

              return (
                <motion.li
                  key={cycle.id}
                  className="bg-white/70 backdrop-blur-md ring-1 ring-[#FFB1DD]/50 shadow-xl rounded-xl p-6 hover:shadow-2xl transition-shadow duration-300"
                  variants={{ hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } }}
                >
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center">
                    <div>
                      <h2 className="text-xl font-semibold text-pink-400 mb-1">
                        Ciclo: {format(parseISO(cycle.startDate), "dd MMM yyyy", { locale: es })} - {endDate}
                      </h2>
                      <p className="text-sm text-slate-400">
                        {recordCount} registro{recordCount !== 1 ? 's' : ''}
                      </p>
                    </div>
                    <Button asChild variant="outline" className="mt-4 sm:mt-0 border-pink-500 text-pink-400 hover:bg-pink-500/20 hover:text-pink-300">
                      <Link to={`/cycle/${cycle.id}`}>
                        <Eye className="mr-2 h-4 w-4" /> Ver Detalles
                      </Link>
                    </Button>
                  </div>
                </motion.li>
              );
            })}
      </motion.ul>
      <EditCycleDatesDialog
        isOpen={showAddDialog}
        onClose={() => setShowAddDialog(false)}
        onConfirm={handleAddCycle}
        title="Añadir Ciclo Anterior"
        description="Ingresa las fechas de un ciclo previo para añadir registros."
      />
    </div>
  );
    };

    export default ArchivedCyclesPage;
  