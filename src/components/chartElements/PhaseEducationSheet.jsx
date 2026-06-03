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
  if (!education) return null;

  const stageStyle =
    isRotated && viewport?.w && viewport?.h
      ? {
          left: '50%',
          top: '50%',
          width: `${viewport.h}px`,
          height: `${viewport.w}px`,
          transform: 'translate(-50%, -50%) rotate(90deg)',
          transformOrigin: 'center center',
        }
      : undefined;

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
            isRotated ? 'items-end' : 'inset-x-0 bottom-0 items-end sm:inset-0 sm:items-center'
          }`}
          style={stageStyle}
          aria-label={education.title}
        >
          <section
            className={`pointer-events-auto flex w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-rose-100 bg-white text-left text-slate-700 shadow-2xl shadow-rose-200/50 sm:rounded-2xl ${
              isRotated ? 'max-h-[min(75dvh,28rem)]' : 'max-h-[75dvh]'
            }`}
            style={{
              marginBottom: isRotated
                ? 'calc(env(safe-area-inset-left, 0px) + 0.75rem)'
                : 'calc(env(safe-area-inset-bottom, 0px) + 0.75rem)',
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
                aria-label="Cerrar explicacion detallada"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </DialogPrimitive.Close>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
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
                      <div className="text-[13px] text-slate-600">{renderBody(section.body)}</div>
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
