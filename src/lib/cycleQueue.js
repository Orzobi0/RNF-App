import { getCachedCycleData, mergeCycleDataCache } from '@/lib/cycleCache';

export const QUEUED_OPERATION_TYPES = {
  CREATE: 'create-entry',
  UPDATE: 'update-entry',
  DELETE: 'delete-entry',
  TOGGLE_IGNORE: 'toggle-ignore-entry'
};

const generateOperationId = () => `op-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

export const createQueuedOperation = (type, cycleId, payload = {}, localRecord = null) => ({
  id: generateOperationId(),
  type,
  cycleId,
  payload,
  localRecord,
  createdAt: new Date().toISOString()
});

export const getQueuedOperations = async (userId) => {
  const cached = await getCachedCycleData(userId);
  return cached?.pendingOperations ?? [];
};

export const persistQueuedOperations = async (userId, operations, extraData = {}) => {
  return mergeCycleDataCache(userId, {
    ...extraData,
    pendingOperations: operations
  });
};