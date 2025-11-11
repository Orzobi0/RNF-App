import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';

const Overlay = ({
  isOpen,
  onClose,
  children,
  ariaLabel,
  containerClassName = '',
  backdropClassName = 'bg-black/40',
}) => {
  useEffect(() => {
    if (!isOpen) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && typeof onClose === 'function') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    const { body } = document;
    const previousOverflow = body.style.overflow;
    body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      body.style.overflow = previousOverflow;
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  if (typeof document === 'undefined') {
    return null;
  }

  const handleBackdropClick = () => {
    if (typeof onClose === 'function') {
      onClose();
    }
  };

  const stopPropagation = (event) => {
    event.stopPropagation();
  };

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center px-4 py-8">
      <div
        className={`absolute inset-0 ${backdropClassName}`}
        onClick={handleBackdropClick}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel ?? undefined}
        className={`relative z-[101] w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-2xl shadow-rose-200/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-200 ${containerClassName}`}
        onClick={stopPropagation}
      >
        {children}
      </div>
    </div>,
    document.body
  );
};

export default Overlay;