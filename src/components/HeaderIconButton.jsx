import React from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const baseClasses =
  'h-9 w-9 shrink-0 rounded-full bg-white/85 backdrop-blur-md shadow-sm shadow-black/5 hover:bg-white hover:brightness-95 [&>svg]:h-5 [&>svg]:w-5';

export const HeaderIconButton = React.forwardRef(
  ({ className, variant = 'neutral', ...props }, ref) => {
    const variantClasses =
      variant === 'primary'
        ? 'border-fertiliapp-fuerte text-fertiliapp-fuerte'
        : 'border-fertiliapp-suave text-subtitulo';

    return (
      <Button
        ref={ref}
        variant="outline"
        size="icon"
        className={cn(baseClasses, variantClasses, className)}
        {...props}
      />
    );
  }
);

HeaderIconButton.displayName = 'HeaderIconButton';

export const HeaderIconButtonPrimary = React.forwardRef((props, ref) => (
  <HeaderIconButton ref={ref} variant="primary" {...props} />
));

HeaderIconButtonPrimary.displayName = 'HeaderIconButtonPrimary';