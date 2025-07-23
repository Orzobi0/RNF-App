
    import React from 'react';
    import { motion } from 'framer-motion';

    const AppHeader = ({ title, subtitle }) => (
      <header className="w-full max-w-4xl mb-8 text-center">
        <motion.h1 
          className="text-4xl sm:text-5xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-rose-400 via-pink-400 to-fuchsia-500 py-2"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          {title || 'Seguimiento de Fertilidad'}
        </motion.h1>
        {subtitle && (
          <motion.p 
            className="text-slate-400 mt-2 text-lg"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            {subtitle}
          </motion.p>
        )}
      </header>
    );

    export default AppHeader;
  