import { useCallback, useEffect, useState } from 'react';
import type { AppMessage } from '@/src/domain/messages';
import { STORAGE_KEY } from '@/src/domain/state';
import type { AppState } from '@/src/domain/types';
import { getState, sendMessage } from '@/src/lib/client';

export function useAppState() {
  const [state, setState] = useState<AppState | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setState(await getState());
      setError(null);
    } catch (value) {
      setError(value instanceof Error ? value.message : 'Không thể đọc dữ liệu.');
    }
  }, []);

  useEffect(() => {
    void refresh();
    const listener = (changes: Record<string, Browser.storage.StorageChange>, area: string) => {
      if (area === 'local' && changes[STORAGE_KEY]?.newValue) setState(changes[STORAGE_KEY].newValue as AppState);
    };
    browser.storage.onChanged.addListener(listener);
    return () => browser.storage.onChanged.removeListener(listener);
  }, [refresh]);

  const act = useCallback(async (message: AppMessage) => {
    const response = await sendMessage(message);
    if (response.state) setState(response.state);
    return response;
  }, []);

  return { state, error, refresh, act };
}
