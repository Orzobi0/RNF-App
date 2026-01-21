import React from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const baseClasses =
  'h-10 w-10 rounded-full bg-white/85 backdrop-blur-md shadow-sm hover:bg-white hover:brightness-95';

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