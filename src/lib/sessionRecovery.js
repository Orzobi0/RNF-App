export const SESSION_RECOVERY_TIMEOUT_MS = 12000;

// Also bounds SDK promises that cannot be cancelled. Callers must guard effects.
export const withDeadline = (promise, ms = SESSION_RECOVERY_TIMEOUT_MS) => {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('session-timeout')), ms);
    }),
  ]).finally(() => clearTimeout(timer));
};

export const createOperationGuard = () => {
  let generation = 0;
  return {
    invalidate: () => { generation += 1; },
    capture: () => {
      const captured = generation;
      return () => captured === generation;
    },
  };
};
