import React from 'react';
import { Button } from '@/components/ui/button';
import { Plus, PlusCircle, ListChecks, RefreshCw } from 'lucide-react';
import { motion } from 'framer-motion';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

const ActionButtons = ({ onAddRecord, onShowRecords, onNewCycle, disableAdd, disableRecords }) => (
  <motion.div
    className="flex items-center justify-between w-full mb-6"
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.5, delay: 0.4 }}
  >
      <Button
      onClick={onShowRecords}
      variant="outline"
      className="border-pink-500 text-pink-400 hover:bg-pink-500/20 hover:text-pink-300 font-semibold py-2 px-4 rounded-3xl shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105 flex items-center text-base"
      disabled={disableRecords}
    >
      <ListChecks className="mr-2 h-6 w-6" />
      Mis Registros
    </Button>
    <Popover>
      <PopoverTrigger asChild>
        <Button
          className="w-12 h-12 rounded-full font-semibold shadow-md hover:shadow-lg transition-all duration-300 transform hover:scale-105 flex items-center justify-center"
        >
          <Plus className="h-6 w-6" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-56 p-2 flex flex-col gap-2">
        <Button
          onClick={onAddRecord}
          className="font-semibold py-2 px-4 shadow-md hover:shadow-lg transition-all duration-300 transform hover:scale-105 flex items-center text-base"
          disabled={disableAdd}
        >
          <PlusCircle className="mr-2 h-5 w-5" />
          Añadir Registro
        </Button>
        <Button
          onClick={onNewCycle}
          variant="outline"
          className="border-rose-500 text-rose-400 hover:bg-rose-500/20 hover:text-rose-300 font-semibold py-2 px-4 rounded-lg shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105 flex items-center text-base"
        >
          <RefreshCw className="mr-2 h-5 w-5" />
          Nuevo Ciclo
        </Button>
      </PopoverContent>
    </Popover>
  </motion.div>
);

export default ActionButtons;