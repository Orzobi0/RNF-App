
    import React from 'react';
    import { motion } from 'framer-motion';

    const AppHeader = ({ title, subtitle }) => (
      <header className="w-full max-w-4xl mb-8 text-center">
        <motion.h1 
          className="text-4xl sm:text-5xl font-bold bg-clip-text text-transparent bg-fertiliapp-suave py-2"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          {title || 'Seguimiento de Fertilidad'}
        </motion.h1>
        {subtitle && (
          <motion.p 
            className="text-fertiliapp-fuerte mt-2 text-lg"
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
  