import React from 'react';
    import { motion } from 'framer-motion';

    const NoDataMessage = () => (
      <motion.div 
        className="text-center text-slate-400 py-10"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.6 }}
      >
        <p className="text-xl mb-4">Aún no hay datos registrados para este ciclo.</p>
        <p>Haz clic en "Añadir Registro" para empezar.</p>
         <div className="mt-8">
           <img  class="mx-auto w-64 h-64 opacity-30" alt="Ilustración abstracta de ciclo y naturaleza con tonos pastel" src="https://images.unsplash.com/photo-1576123598192-1ac6e1035a3d" />
         </div>
      </motion.div>
    );

    export default NoDataMessage;