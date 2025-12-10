import React from 'react';
    import { Button } from '@/components/ui/button';
    import { Save, XCircle } from 'lucide-react';

    const DataEntryFormActions = ({ onCancel, isProcessing, isEditing }) => {
      return (
        <div className="flex space-x-3 pt-2">
          {onCancel && (
            <Button
              type="button"
              onClick={onCancel}
              variant="outline"
              className="w-full rounded-3xl border-pink-200 bg-white/70 text-gray-700 hover:bg-fertiliapp-fuerte font-semibold py-2.5 text-sm"
              disabled={isProcessing}
            >
              <XCircle className="mr-2 h-5 w-5" />
              Cancelar
            </Button>
          )}
            <Button
            type="submit"
            className="w-full rounded-3xl bg-ok hover:bg-ok-fuerte text-white font-semibold py-2.5 text-sm shadow-md hover:shadow-lg transition-all duration-300 transform hover:scale-102"
            disabled={isProcessing}
          >
            {isProcessing ? (
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
            ) : (
              <Save className="mr-2 h-5 w-5" />
            )}
            {isEditing ? 'Actualizar' : 'Guardar'}
          </Button>
        </div>
      );
    };

    export default DataEntryFormActions;