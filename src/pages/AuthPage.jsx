import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { getAuthErrorMessage } from '@/lib/authErrorMessages';
import { motion } from 'framer-motion';
import { LogIn, UserPlus, Mail, KeyRound, Eye, EyeOff } from 'lucide-react';
import InstallPrompt from '@/components/InstallPrompt';

const AuthPage = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resetEmail, setResetEmail] = useState('');
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const { login, register, resetPassword } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const forceInstallPrompt = import.meta.env.VITE_FORCE_INSTALL_PROMPT === 'true';

  const authNotice =
    searchParams.get('verified') === '1'
      ? 'Correo verificado. Ya puedes iniciar sesión.'
      : searchParams.get('reset') === '1'
        ? 'Contraseña actualizada. Inicia sesión con tu nueva contraseña.'
        : searchParams.get('emailUpdated') === '1'
          ? 'Correo actualizado. Inicia sesión con tu nuevo correo si es necesario.'
          : '';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (isLogin) {
        await login(email, password);
        navigate('/');
      } else {
        if (password !== confirmPassword) {
          toast({
            title: 'Revisa las contraseñas',
            description: 'Las contraseñas no coinciden.',
            variant: 'destructive',
          });
          setLoading(false);
          return;
        }
        await register(email, password);
        toast({
          title: 'Verificación requerida',
          description:
            'Te hemos enviado un correo de verificación. Revisa también la carpeta de spam o correo no deseado.',
        });
        setIsLogin(true);
        setPassword('');
        setConfirmPassword('');
      }
      setLoading(false);
    } catch (error) {
      toast({
        title: isLogin ? 'No se pudo iniciar sesión' : 'No se pudo crear la cuenta',
        description: getAuthErrorMessage(error),
        variant: 'destructive',
      });
      setLoading(false);
    }
  };

  const handleOpenResetDialog = () => {
    setResetEmail(email);
    setShowResetDialog(true);
  };

  const handleResetPassword = async (event) => {
    event.preventDefault();
    const emailToReset = resetEmail.trim();

    if (!emailToReset) {
      toast({
        title: 'Correo requerido',
        description: 'Introduce tu correo para restablecer la contraseña.',
        variant: 'destructive',
      });
      return;
    }
    setResetLoading(true);
    try {
      await resetPassword(emailToReset);
      setShowResetDialog(false);
      toast({
        title: 'Revisa tu correo',
        description:
          'Si existe una cuenta con ese correo, te enviaremos un enlace para restablecer la contraseña. Revisa también spam o correo no deseado.',
      });
    } catch (error) {
      toast({
        title: 'No se pudo solicitar el enlace',
        description: getAuthErrorMessage(error),
        variant: 'destructive',
      });
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <div className="relative flex h-app flex-col items-center justify-center p-4">
      <motion.div
        className="w-full max-w-md rounded-3xl bg-white/80 p-8 shadow-xl backdrop-blur-md sm:p-10"
        initial={{ opacity: 0, y: -30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
      >
        <div className="mb-8 text-center">
          <motion.h1
            className="mb-2 bg-fertiliapp bg-clip-text py-2 text-3xl font-bold text-transparent sm:text-4xl"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2, duration: 0.5 }}
          >
            FertiliApp
          </motion.h1>
          <p className="text-lg text-gray-600">
            {isLogin ? 'Inicia sesión para continuar' : 'Crea tu cuenta'}
          </p>
        </div>

        {authNotice ? (
          <div className="mb-6 rounded-2xl border border-fertiliapp-suave bg-tarjeta px-4 py-3 text-sm font-medium text-fertiliapp-fuerte">
            {authNotice}
          </div>
        ) : null}

        <form onSubmit={handleSubmit} className="space-y-6" autoComplete="on">
          <div className="space-y-2">
            <Label htmlFor="email" className="flex items-center text-lg text-gray-700">
              <Mail className="mr-2 h-5 w-5 text-fertiliapp-fuerte" /> Correo Electrónico
            </Label>
            <Input
              id="email"
              name="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@email.com"
              autoComplete="email"
              inputMode="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              required
              className="rounded-3xl border-gray-200 bg-gray-50 px-4 py-3 text-gray-800 placeholder-gray-400 focus:border-fertiliapp-fuerte focus:ring-fertiliapp-fuerte"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password" className="flex items-center text-lg text-gray-700">
              <KeyRound className="mr-2 h-5 w-5 text-fertiliapp-fuerte" /> Contraseña
            </Label>
            <div className="relative">
              <Input
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete={isLogin ? 'current-password' : 'new-password'}
                required
                className="rounded-3xl border-gray-200 bg-gray-50 px-4 py-3 pr-10 text-gray-800 placeholder-gray-400 focus:border-fertiliapp-fuerte focus:ring-fertiliapp-fuerte"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-3 flex items-center text-gray-500"
                aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              >
                {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
          </div>

          {isLogin && (
            <div className="text-right">
              <Button
                variant="link"
                type="button"
                onClick={handleOpenResetDialog}
                className="text-sm text-fertiliapp-fuerte hover:text-fertiliapp"
              >
                ¿Olvidaste tu contraseña?
              </Button>
            </div>
          )}

          {!isLogin && (
            <div className="space-y-2">
              <Label htmlFor="confirmPassword" className="flex items-center text-lg text-gray-700">
                <KeyRound className="mr-2 h-5 w-5 text-fertiliapp-fuerte" /> Confirmar Contraseña
              </Label>
              <div className="relative">
                <Input
                  id="confirmPassword"
                  name="confirmPassword"
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="new-password"
                  required
                  className="rounded-3xl border-gray-200 bg-gray-50 px-4 py-3 pr-10 text-gray-800 placeholder-gray-400 focus:border-fertiliapp-fuerte focus:ring-fertiliapp-fuerte"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute inset-y-0 right-3 flex items-center text-gray-500"
                  aria-label={showConfirmPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                >
                  {showConfirmPassword ? (
                    <EyeOff className="h-5 w-5" />
                  ) : (
                    <Eye className="h-5 w-5" />
                  )}
                </button>
              </div>
            </div>
          )}

          <Button
            type="submit"
            disabled={loading}
            className="flex w-full transform items-center justify-center bg-fertiliapp-fuerte py-3 text-lg font-semibold text-white shadow-md transition-all duration-300 hover:scale-105 hover:brightness-95 hover:shadow-lg"
          >
            {loading ? (
              <div className="h-5 w-5 animate-spin rounded-full border-b-2 border-white"></div>
            ) : isLogin ? (
              <>
                <LogIn className="mr-2 h-5 w-5" /> Iniciar Sesión
              </>
            ) : (
              <>
                <UserPlus className="mr-2 h-5 w-5" /> Registrarse
              </>
            )}
          </Button>
        </form>
        <InstallPrompt
          className="mt-6"
          buttonClassName="w-full bg-fertiliapp-fuerte hover:brightness-95"
          forceVisible={forceInstallPrompt}
        />

        <div className="mt-8 text-center">
          <Button
            variant="link"
            onClick={() => setIsLogin(!isLogin)}
            className="text-base text-fertiliapp-fuerte hover:text-fertiliapp"
          >
            {isLogin ? '¿No tienes cuenta? Regístrate' : '¿Ya tienes cuenta? Inicia sesión'}
          </Button>
        </div>
      </motion.div>
      <footer className="mt-12 w-full max-w-md text-center text-sm text-gray-500">
        <p>&copy; {new Date().getFullYear()} FertiliApp. Todos los derechos reservados.</p>
      </footer>

      <Dialog open={showResetDialog} onOpenChange={setShowResetDialog}>
        <DialogContent className="w-[calc(100%-2rem)] rounded-3xl border border-fertiliapp-suave bg-white/95 sm:max-w-md">
          <form onSubmit={handleResetPassword} className="space-y-4" autoComplete="on">
            <DialogHeader>
              <DialogTitle className="text-titulo">Restablecer contraseña</DialogTitle>
              <DialogDescription>
                Introduce tu correo y te enviaremos un enlace si existe una cuenta asociada.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-2">
              <Label htmlFor="reset-email" className="text-sm font-semibold text-titulo">
                Correo electrónico
              </Label>
              <Input
                id="reset-email"
                name="reset-email"
                type="email"
                value={resetEmail}
                onChange={(event) => setResetEmail(event.target.value)}
                placeholder="tu@email.com"
                autoComplete="email"
                inputMode="email"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                required
                className="rounded-3xl border-fertiliapp-suave bg-gray-50 px-4 py-3 text-gray-800 placeholder-gray-400 focus:border-fertiliapp-fuerte focus:ring-fertiliapp-fuerte"
              />
            </div>

            <DialogFooter className="gap-2 sm:gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowResetDialog(false)}
                disabled={resetLoading}
                className="min-h-11 border-fertiliapp-suave text-fertiliapp-fuerte"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={resetLoading}
                className="min-h-11 bg-fertiliapp-fuerte text-white hover:brightness-95"
              >
                {resetLoading ? 'Enviando...' : 'Enviar enlace'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AuthPage;
