
    import React from 'react';
    import { Link } from 'react-router-dom';
    import { useCycleData } from '@/hooks/useCycleData';
    import { Button } from '@/components/ui/button';
    import { format } from 'date-fns';
    import { es } from 'date-fns/locale';
    import { Archive, Eye } from 'lucide-react';
    import { motion } from 'framer-motion';

    const ArchivedCyclesPage = () => {
      const { archivedCycles, isLoading } = useCycleData();

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
            <Button asChild className="mt-8 bg-gradient-to-r from-emerald-500 to-cyan-600 hover:from-emerald-600 hover:to-cyan-700 text-white">
              <Link to="/">Volver al Ciclo Actual</Link>
            </Button>
          </motion.div>
        );
      }
      
      const sortedArchivedCycles = [...archivedCycles].sort((a,b) => new Date(b.startDate) - new Date(a.startDate));

      return (
        <div className="w-full max-w-4xl mx-auto">
          <motion.h1 
            className="text-3xl sm:text-4xl font-bold text-slate-100 mb-8 text-center"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            Mis Ciclos Archivados
          </motion.h1>
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
                ? format(new Date(cycle.endDate), "dd MMM yyyy", { locale: es })
                : cycle.data && cycle.data.length > 0
                  ? format(new Date(cycle.data[cycle.data.length - 1].isoDate), "dd MMM yyyy", { locale: es })
                  : format(new Date(cycle.startDate), "dd MMM yyyy", { locale: es });
              const recordCount = cycle.data ? cycle.data.length : 0;

              return (
                <motion.li 
                  key={cycle.id} 
                  className="bg-slate-800/70 backdrop-blur-md shadow-xl rounded-xl p-6 hover:shadow-2xl transition-shadow duration-300"
                  variants={{ hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } }}
                >
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center">
                    <div>
                      <h2 className="text-xl font-semibold text-emerald-400 mb-1">
                        Ciclo: {format(new Date(cycle.startDate), "dd MMM yyyy", { locale: es })} - {endDate}
                      </h2>
                      <p className="text-sm text-slate-400">
                        {recordCount} registro{recordCount !== 1 ? 's' : ''}
                      </p>
                    </div>
                    <Button asChild variant="outline" className="mt-4 sm:mt-0 border-purple-500 text-purple-400 hover:bg-purple-500/20 hover:text-purple-300">
                      <Link to={`/cycle/${cycle.id}`}>
                        <Eye className="mr-2 h-4 w-4" /> Ver Detalles
                      </Link>
                    </Button>
                  </div>
                </motion.li>
              );
            })}
          </motion.ul>
        </div>
      );
    };

    export default ArchivedCyclesPage;
  