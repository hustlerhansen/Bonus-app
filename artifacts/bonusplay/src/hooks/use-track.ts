import { useCallback, useRef } from 'react';
import { useRecordAnalyticsEvent, type AnalyticsInputEvent } from '@workspace/api-client-react';

/** Sender bruksstatistikk. Feil ignoreres, og ingen belønning gis. */
export function useTrack() {
  const m = useRecordAnalyticsEvent();
  const ref = useRef(m.mutate);
  ref.current = m.mutate;
  return useCallback((event: AnalyticsInputEvent, sourceId?: string) => {
    ref.current({ data: sourceId ? { event, sourceId } : { event } }, { onError: () => {} });
  }, []);
}
