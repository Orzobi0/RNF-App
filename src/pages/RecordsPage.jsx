import React, { useState } from 'react';
import RecordsList from '@/components/RecordsList';
import DataEntryForm from '@/components/DataEntryForm';
import DeletionDialog from '@/components/DeletionDialog';
import { useCycleData } from '@/hooks/useCycleData';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Edit } from 'lucide-react';
import { format, parseISO } from 'date-fns';

const RecordsPage = () => {
  const { currentCycle, addOrUpdateDataPoint, deleteRecord, isLoading } = useCycleData();
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);
  const [recordToDelete, setRecordToDelete] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleEdit = (record) => {
    setEditingRecord(record);
    setShowForm(true);
  };

  const handleDeleteRequest = (recordId) => {
    const record = currentCycle.data.find(r => r.id === recordId);
    setRecordToDelete(record);
  };

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
    return <p className="text-center text-gray-500">Cargando...</p>;
  }

  if (!currentCycle?.id) {
    return <p className="text-center text-gray-500">No hay ciclo activo.</p>;
  }

  return (
    <div className="max-w-4xl mx-auto">
      {!showForm && (
        <div className="my-4">
          <Button
            onClick={() => { setEditingRecord(null); setShowForm(true); }}
            className="w-full sm:w-auto bg-gradient-to-r from-pink-500 to-fuchsia-600 hover:from-pink-600 hover:to-fuchsia-700 text-white"
            disabled={isProcessing}
          >
            <Edit className="mr-2 h-4 w-4" /> Añadir registro
          </Button>
        </div>
      )}

      {!showForm && (
        <RecordsList
          records={currentCycle.data}
          onEdit={handleEdit}
          onDelete={handleDeleteRequest}
          isProcessing={isProcessing}
        />
      )}

      {showForm && (
        <DataEntryForm
          onSubmit={handleSave}
          onCancel={() => { setShowForm(false); setEditingRecord(null); }}
          initialData={editingRecord}
          cycleStartDate={currentCycle.startDate}
          cycleEndDate={currentCycle.endDate}
          isProcessing={isProcessing}
          isEditing={!!editingRecord}
        />
      )}

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