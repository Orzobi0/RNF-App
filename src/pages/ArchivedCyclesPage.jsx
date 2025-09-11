import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useCycleData } from '@/hooks/useCycleData';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { Archive, Eye, Plus, Trash2, Calendar, BarChart3 } from 'lucide-react';
import { motion } from 'framer-motion';
import EditCycleDatesDialog from '@/components/EditCycleDatesDialog';

const ArchivedCyclesPage = () => {
  const { currentCycle, archivedCycles, isLoading, addArchivedCycle, updateCycleDates, deleteCycle } = useCycleData();
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingCycle, setEditingCycle] = useState(null);

  const handleAddCycle = async ({ startDate, endDate }) => {
    try {
      await addArchivedCycle(startDate, endDate);
      setShowAddDialog(false);
    } catch (error) {
      // error handled via toast
    }
  };

  const handleEditCycle = (cycle) => {
    setEditingCycle(cycle);
  };

  const handleUpdateCycle = async ({ startDate, endDate }) => {
    if (!editingCycle) return;
    try {
      await updateCycleDates(editingCycle.id, startDate, endDate);
      setEditingCycle(null);
    } catch (error) {
      // error handled via toast in updateCycleDates
    }
  };

  const handleDeleteCycle = (cycleId) => {
    if (window.confirm('¿Eliminar este ciclo?')) {
      deleteCycle(cycleId);
    }
  };

  const allCycles = currentCycle.id
    ? [{ ...currentCycle, isCurrent: true, needsCompletion: !currentCycle.endDate }, ...archivedCycles]
    : archivedCycles;

  if (isLoading) {
    return (
      <div className="min-h-[100dvh] bg-gradient-to-br from-rose-100 via-pink-100 to-rose-100 flex items-center justify-center">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(65% 55% at 50% 32%, rgba(244,114,182,0.18) 0%, rgba(244,114,182,0.12) 35%, rgba(244,114,182,0.06) 60%, rgba(244,114,182,0) 100%)'
          }}
        />
        <div className="text-center text-slate-600 p-8">Cargando ciclos archivados...</div>
      </div>
    );
  }

  if (!allCycles || allCycles.length === 0) {
    return (
      <div className="min-h-[100dvh] bg-gradient-to-br from-rose-100 via-pink-100 to-rose-100 relative">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(65% 55% at 50% 32%, rgba(244,114,182,0.18) 0%, rgba(244,114,182,0.12) 35%, rgba(244,114,182,0.06) 60%, rgba(244,114,182,0) 100%)'
          }}
        />
        <div className="flex items-center justify-center min-h-[100dvh] px-4">
          <motion.div
            className="text-center text-slate-600 flex flex-col items-center max-w-md"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <div className="bg-white/70 backdrop-blur-md rounded-3xl p-8 border border-pink-200/50 shadow-lg">
              <div className="w-20 h-20 mx-auto mb-6 bg-gradient-to-br from-pink-100 to-rose-100 rounded-full flex items-center justify-center">
                <Archive className="w-10 h-10 text-pink-500" />
              </div>
              <h2 className="text-2xl font-semibold text-slate-700 mb-4">No hay ciclos archivados</h2>
              <p className="text-slate-600 mb-8">Cuando inicies un nuevo ciclo, el anterior aparecerá aquí.</p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Button asChild className="bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-600 hover:to-rose-600 text-white shadow-lg">
                  <Link to="/">Volver al Ciclo Actual</Link>
                </Button>
                <Button 
                  onClick={() => setShowAddDialog(true)} 
                  className="bg-gradient-to-r from-purple-500 to-indigo-500 hover:from-purple-600 hover:to-indigo-600 text-white shadow-lg"
                >
                  <Plus className="mr-2 h-4 w-4" /> Crear Ciclo
                </Button>
              </div>
            </div>
          </motion.div>
        </div>
        <EditCycleDatesDialog
          isOpen={showAddDialog}
          onClose={() => setShowAddDialog(false)}
          onConfirm={handleAddCycle}
          title="Añadir Ciclo Anterior"
          description="Ingresa las fechas de un ciclo previo para añadir registros."
        />
      </div>
    );
  }

  const sortedCycles = [...allCycles].sort(
    (a, b) => parseISO(b.startDate) - parseISO(a.startDate)
  );

  return (
    <div className="min-h-[100dvh] bg-gradient-to-br from-rose-100 via-pink-100 to-rose-100 relative">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(65% 55% at 50% 32%, rgba(244,114,182,0.18) 0%, rgba(244,114,182,0.12) 35%, rgba(244,114,182,0.06) 60%, rgba(244,114,182,0) 100%)'
        }}
      />
      
      <div className="w-full max-w-4xl mx-auto px-4 py-6 relative z-10">
        {/* Header */}
        <motion.div
          className="flex flex-col sm:flex-row justify-between items-center mb-8"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <h1 className="text-3xl sm:text-4xl font-bold text-slate-700 mb-4 sm:mb-0 flex items-center">
            <Archive className="mr-3 h-8 w-8 text-pink-500" />
            Mis Ciclos
          </h1>
          <Button 
            onClick={() => setShowAddDialog(true)} 
            className="bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-600 hover:to-rose-600 text-white shadow-lg"
            style={{ filter: 'drop-shadow(0 6px 12px rgba(236, 72, 153, 0.3))' }}
          >
            <Plus className="mr-2 h-4 w-4" /> Añadir Ciclo
          </Button>
        </motion.div>

        {/* Cycles List */}
        <motion.div
          className="space-y-4"
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
          {sortedCycles.map((cycle) => {
            const endDate = cycle.endDate
              ? format(parseISO(cycle.endDate), "dd MMM yyyy", { locale: es })
              : 'Sin fecha fin';
            const recordCount = cycle.data ? cycle.data.length : 0;

            return (
              <motion.div
                key={cycle.id}
                className="bg-white/80 backdrop-blur-md border border-pink-200/50 shadow-lg hover:shadow-xl transition-all duration-300 hover:bg-white/90 rounded-xl"
                variants={{ hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } }}
              >
                <div className="p-5">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center">
                    {/* Información del ciclo */}
                    <div className="flex items-start space-x-4 flex-1">
                      {/* Icono del ciclo */}
                      <div className="flex flex-col items-center">
                        <div className="w-12 h-12 bg-gradient-to-br from-pink-100 to-rose-100 rounded-full flex items-center justify-center flex-shrink-0">
                          <Calendar className="w-6 h-6 text-pink-600" />
                        </div>
                      </div>

                      {/* Detalles del ciclo */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center flex-wrap gap-2 mb-2">
                          <h2 className="text-lg font-semibold text-slate-700">
                            {format(parseISO(cycle.startDate), "dd MMM yyyy", { locale: es })} - {endDate}
                          </h2>
                          {cycle.isCurrent && (
                            <Badge className="bg-gradient-to-r from-pink-500 to-rose-500 text-white text-xs">
                              Ciclo actual
                            </Badge>
                          )}
                        </div>
                        
                        <div className="flex items-center space-x-4 text-sm text-slate-600">
                          <div className="flex items-center space-x-1">
                            <BarChart3 className="w-4 h-4 text-slate-500" />
                            <span>{recordCount} registro{recordCount !== 1 ? 's' : ''}</span>
                          </div>
                          
                          {cycle.endDate && (
                            <div className="flex items-center space-x-1">
                              <Calendar className="w-4 h-4 text-slate-500" />
                              <span>
                                {Math.ceil((parseISO(cycle.endDate) - parseISO(cycle.startDate)) / (1000 * 60 * 60 * 24)) + 1} días
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Botones de acción */}
                    <div className="flex flex-col sm:flex-row gap-2 mt-4 sm:mt-0 w-full sm:w-auto">
                      <Button 
                        asChild 
                        variant="outline" 
                        size="sm"
                        className="w-full sm:w-auto border-pink-300 text-pink-600 hover:bg-pink-50 hover:border-pink-400"
                      >
                        <Link to={cycle.isCurrent ? `/` : `/cycle/${cycle.id}`}>
                          <Eye className="mr-2 h-4 w-4" /> Ver
                        </Link>
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm"
                        className="w-full sm:w-auto border-rose-300 text-rose-600 hover:bg-rose-50 hover:border-rose-400" 
                        onClick={() => handleDeleteCycle(cycle.id)}
                      >
                        <Trash2 className="mr-2 h-4 w-4" /> Eliminar
                      </Button>
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </motion.div>
      </div>

      {/* Dialogs */}
      <EditCycleDatesDialog
        isOpen={showAddDialog}
        onClose={() => setShowAddDialog(false)}
        onConfirm={handleAddCycle}
        title="Añadir Ciclo Anterior"
        description="Ingresa las fechas de un ciclo previo para añadir registros."
      />
      
      <EditCycleDatesDialog
        isOpen={!!editingCycle}
        onClose={() => setEditingCycle(null)}
        onConfirm={handleUpdateCycle}
        initialStartDate={editingCycle?.startDate}
        initialEndDate={editingCycle?.endDate}
        title="Editar Fechas del Ciclo"
        description="Actualiza las fechas del ciclo."
      />
    </div>
  );
};

export default ArchivedCyclesPage;