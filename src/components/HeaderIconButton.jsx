import React from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const baseClasses =
  'h-9 w-9 shrink-0 rounded-full bg-white/85 backdrop-blur-md shadow-sm shadow-black/5 transition-colors [-webkit-tap-highlight-color:transparent] active:brightness-95 [&>svg]:h-5 [&>svg]:w-5 [&>svg]:opacity-100 [&>svg]:stroke-current';

  // Hover SOLO en dispositivos que realmente soportan hover (evita “hover pegajoso” en móvil)
// En pantallas táctiles, el :hover se queda "pegado": lo igualamos al estado normal
const hoverFixTouch =
  '[@media(hover:none)]:[&:not([aria-pressed=true])]:hover:bg-white/85 ' +
  '[@media(hover:none)]:[&:not([aria-pressed=true])]:hover:brightness-100';

// Hover SOLO en dispositivos con hover real (ratón/trackpad)
const hoverOnlyOnHoverDevices =
  '[@media(hover:hover)]:hover:bg-white [@media(hover:hover)]:hover:brightness-95';
// Invertir cuando aria-pressed="true" (selector directo, más fiable que aria-variant)
const pressedInvert =
  '[&[aria-pressed=true]]:!bg-fertiliapp-fuerte ' +
  '[&[aria-pressed=true]]:!border-fertiliapp-fuerte ' +
  '[&[aria-pressed=true]]:!text-white ' +
  '[&[aria-pressed=true]]:shadow-sm';

  export const HeaderIconButton = React.forwardRef(
  ({ className, variant = 'neutral', active = false, style, ...props }, ref) => {
    const variantClasses =
      variant === 'primary'
        ? 'border-fertiliapp-fuerte text-fertiliapp-fuerte hover:text-fertiliapp-fuerte active:text-fertiliapp-fuerte'
        : 'border-fertiliapp-suave text-subtitulo hover:text-subtitulo active:text-subtitulo';
   const activeStyle = active
      ? {
          backgroundColor: 'var(--color-fertiliapp-fuerte)',
          borderColor: 'var(--color-fertiliapp-fuerte)',
          color: '#fff',
        }
      : undefined;

    return (
      <Button
        ref={ref}
        variant="outline"
        size="icon"
        className={cn(baseClasses, hoverFixTouch, hoverOnlyOnHoverDevices, variantClasses, pressedInvert, className)}
        style={active ? { ...(style || {}), ...activeStyle } : style}
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