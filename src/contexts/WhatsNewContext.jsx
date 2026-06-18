import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

export const WHATS_NEW_VERSION = '2026-06-interpretacion';

export const WHATS_NEW_KEYS = {
  modalSeen: `fertiliapp:whatsNew:modalSeen:${WHATS_NEW_VERSION}`,
  supportSeen: `fertiliapp:whatsNew:supportSeen:${WHATS_NEW_VERSION}`,
  chartInterpretationSeen: `fertiliapp:whatsNew:chartInterpretationSeen:${WHATS_NEW_VERSION}`,
};

const WhatsNewContext = createContext(null);

const readFlag = (key) => {
  if (typeof window === 'undefined') return false;

  try {
    return window.localStorage.getItem(key) === '1';
  } catch (error) {
    return false;
  }
};

const writeFlag = (key) => {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(key, '1');
  } catch (error) {
    // Ignore storage errors so Safari private mode or locked storage never break the app.
  }
};

const readState = () => ({
  modalSeen: readFlag(WHATS_NEW_KEYS.modalSeen),
  supportSeen: readFlag(WHATS_NEW_KEYS.supportSeen),
  chartInterpretationSeen: readFlag(WHATS_NEW_KEYS.chartInterpretationSeen),
});

export const WhatsNewProvider = ({ children }) => {
  const [state, setState] = useState(readState);

  const markSeen = useCallback((name) => {
    const key = WHATS_NEW_KEYS[name];
    if (!key) return;

    writeFlag(key);
    setState((previous) => (
      previous[name] ? previous : { ...previous, [name]: true }
    ));
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const handleStorage = (event) => {
      if (!Object.values(WHATS_NEW_KEYS).includes(event.key)) return;
      setState(readState());
    };

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const value = useMemo(
    () => ({
      version: WHATS_NEW_VERSION,
      modalSeen: state.modalSeen,
      supportSeen: state.supportSeen,
      chartInterpretationSeen: state.chartInterpretationSeen,
      hasUnseenSupport: !state.supportSeen,
      hasUnseenChartInterpretation: !state.chartInterpretationSeen,
      markModalSeen: () => markSeen('modalSeen'),
      markSupportSeen: () => markSeen('supportSeen'),
      markChartInterpretationSeen: () => markSeen('chartInterpretationSeen'),
    }),
    [markSeen, state.chartInterpretationSeen, state.modalSeen, state.supportSeen]
  );

  return (
    <WhatsNewContext.Provider value={value}>
      {children}
    </WhatsNewContext.Provider>
  );
};

export const useWhatsNew = () => {
  const context = useContext(WhatsNewContext);
  if (!context) {
    throw new Error('useWhatsNew must be used within WhatsNewProvider');
  }
  return context;
};
