import React from 'react';
    import { Button } from '@/components/ui/button';
    import { Save, XCircle } from 'lucide-react';

    const DataEntryFormActions = ({ onCancel, isProcessing, isEditing }) => {
      return (
        <div className="-mx-3 -mb-3 mt-2 shrink-0 border-t border-pink-100 bg-[#FFF7FA] px-3 pb-3 pt-2 sm:-mx-4 sm:-mb-4 sm:px-4 sm:pb-4">
         <div className="flex space-x-2.5">
          {onCancel && (
            <Button
              type="button"
              onClick={onCancel}
              variant="outline"
              className="w-full rounded-3xl border-pink-200 bg-white/70 text-gray-700 hover:bg-alerta font-semibold py-2 text-sm"
              disabled={isProcessing}
            >
              <XCircle className="mr-2 h-4 w-4" />
              Cancelar
            </Button>
          )}
            <Button
            type="submit"
            className="w-full rounded-3xl bg-ok hover:bg-ok-fuerte text-white font-semibold py-2 text-sm shadow-md hover:shadow-lg transition-all duration-300 transform hover:scale-102"
            disabled={isProcessing}
          >
            {isProcessing ? (
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            {isEditing ? 'Actualizar' : 'Guardar'}
          </Button>
        </div>
        </div>
      );
    };

    export default DataEntryFormActions;