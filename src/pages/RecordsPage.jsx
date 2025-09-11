import React, { useState, useCallback } from 'react';
import RecordsList from '@/components/RecordsList';
import DataEntryForm from '@/components/DataEntryForm';
import DeletionDialog from '@/components/DeletionDialog';
import { useCycleData } from '@/hooks/useCycleData';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Edit, Plus, FileText } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { motion } from 'framer-motion';

const RecordsPage = () => {
  const { currentCycle, addOrUpdateDataPoint, deleteRecord, isLoading } = useCycleData();
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);
  const [recordToDelete, setRecordToDelete] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleCloseForm = useCallback(() => {
    setShowForm(false);
    setEditingRecord(null);
  }, []);

  const handleEdit = (record) => {
    setEditingRecord(record);
    setShowForm(true);
  };

  const handleDeleteRequest = (recordId) => {
    const record = currentCycle.data.find(r => r.id === recordId);
    setRecordToDelete(record);
  };

  const handleDateSelect = useCallback((record) => {
    setEditingRecord(record);
  }, []);

  const handleSave = async (data) => {
    setIsProcessing(true);
    try {
      await addOrUpdateDataPoint(data, editingRecord);
      setShowForm(false);
      setEditingRecord(null);
    } catch (error) {
      toast({ title: 'Error', description: 'No se pudo guardar el registro', variant: 'destructive' });
    } finally {
      setIsProcessing(false);
    }
  };

  const confirmDelete = async () => {
    if (!recordToDelete) return;
    setIsProcessing(true);
    try {
      await deleteRecord(recordToDelete.id);
      setRecordToDelete(null);
    } catch {
      toast({ title: 'Error', description: 'No se pudo eliminar el registro', variant: 'destructive' });
    } finally {
      setIsProcessing(false);
    }
  };

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
        <p className="text-center text-slate-600 text-lg">Cargando...</p>
      </div>
    );
  }

  if (!currentCycle?.id) {
    return (
      <div className="min-h-[100dvh] bg-gradient-to-br from-rose-100 via-pink-100 to-rose-100 flex items-center justify-center">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(65% 55% at 50% 32%, rgba(244,114,182,0.18) 0%, rgba(244,114,182,0.12) 35%, rgba(244,114,182,0.06) 60%, rgba(244,114,182,0) 100%)'
          }}
        />
        <p className="text-center text-slate-600 text-lg">No hay ciclo activo.</p>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-gradient-to-br from-rose-100 via-pink-100 to-rose-100 relative">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(65% 55% at 50% 32%, rgba(244,114,182,0.18) 0%, rgba(244,114,182,0.12) 35%, rgba(244,114,182,0.06) 60%, rgba(244,114,182,0) 100%)'
        }}
      />
      
      <div className="max-w-4xl mx-auto px-4 py-6 relative z-10">
        {/* Header */}
        <motion.div
          className="flex flex-col sm:flex-row justify-between items-center mb-6"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <h1 className="text-3xl sm:text-4xl font-bold text-slate-700 mb-4 sm:mb-0 flex items-center">
            <FileText className="mr-3 h-8 w-8 text-pink-500" />
            Mis Registros
          </h1>
          <Button
            type="button"
            onClick={() => { setEditingRecord(null); setShowForm(true); }}
            className="bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-600 hover:to-rose-600 text-white shadow-lg"
            disabled={isProcessing}
            style={{ filter: 'drop-shadow(0 6px 12px rgba(236, 72, 153, 0.3))' }}
          >
            <Plus className="mr-2 h-4 w-4" />
            Añadir registro
          </Button>
        </motion.div>

        {/* Records List */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
        >
          <RecordsList
            records={currentCycle.data}
            onEdit={handleEdit}
            onDelete={handleDeleteRequest}
            isProcessing={isProcessing}
          />
        </motion.div>
      </div>

      <Dialog
        open={showForm}
        onOpenChange={(open) => {
          if (open) {
            setShowForm(true);
          } else {
            handleCloseForm();
          }
        }}
      >
        <DialogContent hideClose className="bg-white border-pink-100 text-gray-800 w-[90vw] sm:w-auto max-w-md sm:max-w-lg md:max-w-xl max-h-[85vh] overflow-y-auto p-4 sm:p-6 rounded-2xl">
          <DataEntryForm
            onSubmit={handleSave}
            onCancel={handleCloseForm}
            initialData={editingRecord}
            cycleStartDate={currentCycle.startDate}
            cycleEndDate={currentCycle.endDate}
            isProcessing={isProcessing}
            isEditing={!!editingRecord}
            cycleData={currentCycle.data}
            onDateSelect={handleDateSelect}
          />
        </DialogContent>
      </Dialog>

      <DeletionDialog
        isOpen={!!recordToDelete}
        onClose={() => setRecordToDelete(null)}
        onConfirm={confirmDelete}
        recordDate={recordToDelete ? format(parseISO(recordToDelete.isoDate), 'dd/MM/yyyy') : ''}
        isProcessing={isProcessing}
      />
    </div>
  );
};

export default RecordsPage;