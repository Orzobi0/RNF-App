import React from 'react';
    import { motion } from 'framer-motion';

    const NoDataMessage = () => (
      <motion.div 
        className="text-center text-slate-400 py-10"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.6 }}
      >
        <p className="text-xl mb-4">Aún no hay datos registrados.</p>
        <p>Inicia un nuevo ciclo o añade un registro para comenzar.</p>
         <div className="mt-8">
          
         </div>
      </motion.div>
    );

    export default NoDataMessage;