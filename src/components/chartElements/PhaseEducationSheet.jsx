import React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { BookOpen, X } from 'lucide-react';

const renderBody = (body) => {
  if (Array.isArray(body)) {
    return (
      <ul className="space-y-1.5">
        {body.filter(Boolean).map((item, index) => (
          <li key={`${item}-${index}`} className="leading-relaxed">
            {item}
          </li>
        ))}
      </ul>
    );
  }

  return <p className="leading-relaxed">{body}</p>;
};

const PhaseEducationSheet = ({
  education,
  open,
  onClose,
  isRotated = false,
  viewport = null,
}) => {
  const scrollDragRef = React.useRef(null);

  if (!education) return null;

  const shouldUseRotatedLayout = Boolean(isRotated && viewport?.w && viewport?.h);

  const stageStyle =
    shouldUseRotatedLayout
      ? {
          left: '50%',
          top: '50%',
          width: `${viewport.h}px`,
          height: `${viewport.w}px`,
          transform: 'translate(-50%, -50%) rotate(90deg)',
          transformOrigin: 'center center',
        }
      : undefined;

  const handleScrollPointerDown = (event) => {
    if (!shouldUseRotatedLayout) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;

    const target = event.currentTarget;
    if (target.scrollHeight <= target.clientHeight) return;

    scrollDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      scrollTop: target.scrollTop,
    };

    target.setPointerCapture?.(event.pointerId);
  };

  const handleScrollPointerMove = (event) => {
    const drag = scrollDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    const target = event.currentTarget;
    const deltaX = event.clientX - drag.startX;
    const deltaY = event.clientY - drag.startY;

    if (Math.abs(deltaX) < 3 && Math.abs(deltaY) < 3) return;

    event.preventDefault();

    const nextScrollTop =
      Math.abs(deltaX) > Math.abs(deltaY)
        ? drag.scrollTop + deltaX
        : drag.scrollTop - deltaY;

    target.scrollTop = nextScrollTop;
  };

  const handleScrollPointerEnd = (event) => {
    const drag = scrollDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    }

    scrollDragRef.current = null;
  };

  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose?.();
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[320] bg-slate-900/25 backdrop-blur-[1px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />

        <DialogPrimitive.Content
          className={`pointer-events-none fixed z-[321] flex justify-center px-3 outline-none ${
            shouldUseRotatedLayout ? 'items-start' : 'inset-0 items-center'
          }`}
          style={{
            ...stageStyle,
            paddingTop: shouldUseRotatedLayout
              ? 'calc(env(safe-area-inset-left, 0px) + 1.25rem)'
              : 'calc(env(safe-area-inset-top, 0px) + 1rem)',
            paddingBottom: shouldUseRotatedLayout
              ? 'calc(env(safe-area-inset-right, 0px) + 1rem)'
              : 'calc(env(safe-area-inset-bottom, 0px) + 1rem)',
          }}
          aria-label={education.title}
        >
          <section
            className="pointer-events-auto flex w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-rose-100 bg-white text-left text-slate-700 shadow-2xl shadow-rose-200/50"
            style={{
              maxHeight: shouldUseRotatedLayout
                ? '100%'
                : 'min(82dvh, calc(100dvh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px) - 2rem))',
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start gap-2 border-b border-rose-50 px-4 pb-3 pt-4">
              <span
                className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-rose-50 text-rose-500"
                aria-hidden="true"
              >
                <BookOpen className="h-4 w-4" />
              </span>

              <div className="min-w-0 flex-1">
                {education.eyebrow && (
                  <p className="text-[11px] font-semibold uppercase leading-tight tracking-normal text-rose-500">
                    {education.eyebrow}
                  </p>
                )}

                <DialogPrimitive.Title className="mt-0.5 text-base font-semibold leading-snug text-fertiliapp-fuerte">
                  {education.title}
                </DialogPrimitive.Title>
              </div>

              <DialogPrimitive.Close
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-200"
                aria-label="Cerrar explicación detallada"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </DialogPrimitive.Close>
            </div>

            <div
              className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3"
              style={{
                WebkitOverflowScrolling: 'touch',
                touchAction: shouldUseRotatedLayout ? 'none' : 'pan-y',
                userSelect: shouldUseRotatedLayout ? 'none' : undefined,
                cursor: shouldUseRotatedLayout ? 'grab' : undefined,
              }}
              onPointerDown={handleScrollPointerDown}
              onPointerMove={handleScrollPointerMove}
              onPointerUp={handleScrollPointerEnd}
              onPointerCancel={handleScrollPointerEnd}
              onLostPointerCapture={() => {
                scrollDragRef.current = null;
              }}
            >
              <DialogPrimitive.Description className="text-sm leading-relaxed text-slate-700">
                {education.summary}
              </DialogPrimitive.Description>

              {Array.isArray(education.sections) && education.sections.length > 0 && (
                <div className="mt-3 space-y-3">
                  {education.sections.map((section) => (
                    <section key={section.title} className="space-y-1">
                      <h3 className="text-sm font-semibold leading-snug text-slate-800">
                        {section.title}
                      </h3>
                      <div className="text-[13px] text-slate-600">
                        {renderBody(section.body)}
                      </div>
                    </section>
                  ))}
                </div>
              )}

              {education.caution && (
                <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] leading-relaxed text-amber-800">
                  {education.caution}
                </p>
              )}
            </div>
          </section>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
};

export default PhaseEducationSheet;