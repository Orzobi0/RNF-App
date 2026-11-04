import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as Toast from '@radix-ui/react-toast';
import { Thermometer, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

// Separate provider: Bluetooth never changes the lifetime/position of other toasts.
export function BleSavedNotice({ notice, onDismiss, onViewDay }) {
  const node = useRef(null);
  const dismiss = useRef(onDismiss); dismiss.current = onDismiss;
  const touch = useRef(null);
  const [element, setElement] = useState(null);
  const attach = useCallback(value => { node.current = value; setElement(value); }, []);
  useEffect(() => {
    if (!notice) return undefined;
    const installedAt = performance.now();
    const outside = event => { if (event.timeStamp < installedAt) return;
      if (node.current && !node.current.contains(event.target)) dismiss.current(); };
    document.addEventListener('click', outside);
    const measure = () => document.documentElement.style.setProperty('--ble-notice-height', `${(node.current?.getBoundingClientRect().height ?? 0) + 12}px`);
    measure();
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;
    if (node.current) observer?.observe(node.current);
    return () => { document.removeEventListener('click', outside); observer?.disconnect(); document.documentElement.style.removeProperty('--ble-notice-height'); };
  }, [Boolean(notice), element]);
  if (!notice) return null;
  return <Toast.Provider duration={Infinity} swipeDirection="right">
    <Toast.Root ref={attach} open duration={Infinity} onOpenChange={open => { if (!open) onDismiss(); }}
      onTouchStart={event => { const point = event.touches[0]; touch.current = { x: point.clientX, y: point.clientY }; }}
      onTouchEnd={event => { const point = event.changedTouches[0], start = touch.current; touch.current = null;
        if (start && (Math.abs(point.clientX - start.x) > 70 || (start.y - point.clientY > 70 && Math.abs(point.clientX - start.x) < 40))) onDismiss(); }}
      className="relative rounded-2xl border border-rose-100 bg-white p-4 pr-12 text-slate-700 shadow-md data-[swipe=move]:translate-x-[var(--radix-toast-swipe-move-x)]">
      <Toast.Title className="flex items-center gap-2 text-sm font-semibold"><Thermometer aria-hidden="true" className="h-5 w-5 text-rose-500" /><Check aria-hidden="true" className="h-4 w-4 text-emerald-700" />{notice.count === 1 ? 'Temperatura incorporada' : `${notice.count} temperaturas incorporadas`}</Toast.Title>
      <Toast.Description className="mt-2 text-sm">{notice.temperature} °C · {notice.time} · {notice.isoDate}</Toast.Description>
      <Button variant="ghost" className="mt-1 min-h-11" onClick={() => { onDismiss(); onViewDay(notice.isoDate); }}>Ver día</Button>
      <Toast.Close asChild><button type="button" aria-label="Cerrar aviso" title="Cerrar aviso" className="absolute right-0 top-0 flex h-11 w-11 items-center justify-center"><X className="h-4 w-4" /></button></Toast.Close>
    </Toast.Root>
    <Toast.Viewport label="Temperaturas incorporadas" className="fixed right-3 z-[100] w-[calc(100%-24px)] max-w-sm outline-none" style={{ top: 'calc(var(--ble-safe-top, env(safe-area-inset-top, 0px)) + 12px)' }} />
  </Toast.Provider>;
}
