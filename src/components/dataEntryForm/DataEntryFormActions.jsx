import React from 'react';
    import { Button } from '@/components/ui/button';
    import { Save, XCircle } from 'lucide-react';

    const DataEntryFormActions = ({ onCancel, isProcessing, isEditing }) => {
      return (
        <div className="flex space-x-4 pt-4">
          {onCancel && (
            <Button 
              type="button" 
              onClick={onCancel}
              variant="outline"
              className="w-full border-slate-600 hover:bg-slate-700 text-[#70747a] font-semibold py-3 text-lg"
              disabled={isProcessing}
            >
              <XCircle className="mr-2 h-5 w-5" />
              Cancelar
            </Button>
          )}
                    <Button
            type="submit"
            className="w-full bg-gradient-to-r from-pink-500 to-fuchsia-600 hover:from-pink-600 hover:to-fuchsia-700 text-white font-semibold py-3 text-lg shadow-md hover:shadow-lg transition-all duration-300 transform hover:scale-102"
            disabled={isProcessing}
          >
            {isProcessing ? (
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
            ) : (
              <Save className="mr-2 h-5 w-5" />
            )}
            {isEditing ? 'Actualizar Registro' : 'Guardar'}
          </Button>
        </div>
      );
    };

    export default DataEntryFormActions;