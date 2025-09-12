export const FERTILITY_SYMBOLS = {
      NONE: { value: 'none', label: 'Sin Símbolo', color: 'bg-gray-200', textColor: '#e2e8f0' },
      MENSTRUATION: { value: 'red', label: 'Menstruación', color: 'bg-red-500', textColor: '#e2e8f0' },
      FERTILE: { value: 'white', label: 'Fértil (Moco)', color: 'bg-white', textColor: '#e2e8f0' },
      INFERTILE: { value: 'green', label: 'Infértil (Sin Moco)', color: 'bg-green-500', textColor: '#e2e8f0' },
      SPOTTING: { value: 'spot', label: 'Spotting', color: 'bg-pink-300', textColor: '#e2e8f0', pattern: 'spotting-pattern' },
    };

    export const FERTILITY_SYMBOL_OPTIONS = Object.values(FERTILITY_SYMBOLS);

    export const getSymbolAppearance = (symbolValue) => {
    const found = FERTILITY_SYMBOL_OPTIONS.find(opt => opt.value === symbolValue);
  return found || FERTILITY_SYMBOLS.NONE;
};