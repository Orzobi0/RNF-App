import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';

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
  const { user, preferences, loadingAuth, restoringSession, savePreferences } = useAuth();
  const [state, setState] = useState(readState);
  const [dismissedKeys, setDismissedKeys] = useState(() => new Set());
  const attemptedSaves = useRef(new Set());
  const modalKey = user?.uid
    ? `${WHATS_NEW_KEYS.modalSeen}:user:${user.uid}`
    : null;
  const ready = Boolean(modalKey && preferences && !loadingAuth && !restoringSession);
  const remotelySeen = preferences?.lastSeenWhatsNewVersion === WHATS_NEW_VERSION;
  const locallySeen = Boolean(modalKey && (dismissedKeys.has(modalKey) || readFlag(modalKey)));
  const legacySeen = !preferences?.lastSeenWhatsNewVersion && state.modalSeen;
  const modalSeen = !ready || remotelySeen || locallySeen || legacySeen;

  const persistModalSeen = useCallback(() => {
    if (!ready || remotelySeen || attemptedSaves.current.has(modalKey)) return;
    attemptedSaves.current.add(modalKey);
    void savePreferences({ lastSeenWhatsNewVersion: WHATS_NEW_VERSION }, { silent: true })
      .catch(() => {
        // Keep the local acknowledgement; allow a later retry without reopening the modal.
        attemptedSaves.current.delete(modalKey);
      });
  }, [modalKey, ready, remotelySeen, savePreferences]);

  const markModalSeen = useCallback(() => {
    if (!ready) return;
    writeFlag(modalKey);
    setDismissedKeys((previous) => new Set(previous).add(modalKey));
    persistModalSeen();
  }, [modalKey, persistModalSeen, ready]);

  useEffect(() => {
    if (!ready || remotelySeen || (!locallySeen && !legacySeen)) return undefined;
    writeFlag(modalKey);
    persistModalSeen();
    window.addEventListener('online', persistModalSeen);
    return () => window.removeEventListener('online', persistModalSeen);
  }, [legacySeen, locallySeen, modalKey, persistModalSeen, ready, remotelySeen]);

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
      if (!Object.values(WHATS_NEW_KEYS).includes(event.key) && event.key !== modalKey) return;
      setState(readState());
    };

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [modalKey]);

  const value = useMemo(
    () => ({
      version: WHATS_NEW_VERSION,
      modalSeen,
      supportSeen: state.supportSeen,
      chartInterpretationSeen: state.chartInterpretationSeen,
      hasUnseenSupport: !state.supportSeen,
      hasUnseenChartInterpretation: !state.chartInterpretationSeen,
      markModalSeen,
      markSupportSeen: () => markSeen('supportSeen'),
      markChartInterpretationSeen: () => markSeen('chartInterpretationSeen'),
    }),
    [markModalSeen, markSeen, modalSeen, state.chartInterpretationSeen, state.supportSeen]
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
