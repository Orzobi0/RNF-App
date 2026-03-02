import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { motion } from 'framer-motion';
import { LogIn, UserPlus, Mail, KeyRound, Eye, EyeOff } from 'lucide-react';
import InstallPrompt from '@/components/InstallPrompt';
const AuthPage = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const { login, register, resetPassword } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const forceInstallPrompt = import.meta.env.VITE_FORCE_INSTALL_PROMPT === 'true';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (isLogin) {
        await login(email, password);
        toast({ title: 'Inicio de sesión exitoso', description: 'Bienvenida de nuevo.' });
        navigate('/');
      } else {
        if (password !== confirmPassword) {
          toast({ title: 'Error de registro', description: 'Las contraseñas no coinciden.', variant: 'destructive' });
          setLoading(false);
          return;
        }
        await register(email, password);
        toast({
          title: 'Verificación requerida',
          description: 'Hemos enviado un correo de verificación. Revisa tu bandeja de entrada para activar tu cuenta.',
        });
        setIsLogin(true);
        setPassword('');
        setConfirmPassword('');
      }
      setLoading(false);
    } catch (error) {
      toast({
        title: isLogin ? 'Error al iniciar sesión' : 'Error al registrarse',
        description: error.message,
        variant: 'destructive'
      });
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!email) {
      toast({
        title: 'Correo requerido',
        description: 'Introduce tu correo para restablecer la contraseña.',
        variant: 'destructive'
      });
      return;
    }
    try {
      await resetPassword(email);
      toast({ title: 'Correo enviado', description: 'Revisa tu bandeja para restablecer la contraseña.' });
    } catch (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  };

  return (
    <div className="relative flex h-app flex-col items-center justify-center p-4">
      <motion.div
        className="w-full max-w-md bg-white/80 backdrop-blur-md shadow-xl rounded-3xl p-8 sm:p-10"
        initial={{ opacity: 0, y: -30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
      >
        <div className="text-center mb-8">
          <motion.h1
            className="text-3xl sm:text-4xl font-bold bg-clip-text text-transparent bg-fertiliapp py-2 mb-2"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2, duration: 0.5 }}
          >
            FertiliApp
          </motion.h1>
          <p className="text-gray-600 text-lg">{isLogin ? 'Inicia sesión para continuar' : 'Crea tu cuenta'}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6" autoComplete="on">
          <div className="space-y-2">
            <Label htmlFor="email" className="flex items-center text-gray-700 text-lg">
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
              className="bg-gray-50 border-gray-200 text-gray-800 placeholder-gray-400 rounded-3xl focus:ring-fertiliapp-fuerte focus:border-fertiliapp-fuerte py-3 px-4"
            />
          </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="flex items-center text-gray-700 text-lg">
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
                  autoComplete={isLogin ? "current-password" : "new-password"}
                  required
                  className="bg-gray-50 border-gray-200 text-gray-800 placeholder-gray-400 rounded-3xl focus:ring-fertiliapp-fuerte focus:border-fertiliapp-fuerte py-3 px-4 pr-10"
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
                onClick={handleResetPassword}
                className="text-pink-600 hover:text-pink-500 text-sm"
              >
                ¿Olvidaste tu contraseña?
              </Button>
            </div>
          )}

            {!isLogin && (
              <div className="space-y-2">
                <Label htmlFor="confirmPassword" className="flex items-center text-gray-700 text-lg">
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
                    className="bg-gray-50 border-gray-200 text-gray-800 placeholder-gray-400 focus:ring-fertiliapp-fuerte focus:border-fertiliapp-fuerte py-3 px-4 pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute inset-y-0 right-3 flex items-center text-gray-500"
                    aria-label={showConfirmPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  >
                    {showConfirmPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
              </div>
            )}

          <Button
            type="submit"
            disabled={loading}
            className="w-full bg-fertiliapp-fuerte hover:brightness-95 text-white font-semibold py-3 text-lg shadow-md hover:shadow-lg transition-all duration-300 transform hover:scale-105 flex items-center justify-center"
          >
            {loading ? (
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
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
            className="text-pink-600 hover:text-pink-500 text-base"
          >
            {isLogin ? '¿No tienes cuenta? Regístrate' : '¿Ya tienes cuenta? Inicia sesión'}
          </Button>
        </div>
      </motion.div>
      <footer className="w-full max-w-md mt-12 text-center text-gray-500 text-sm">
        <p>&copy; {new Date().getFullYear()} FertiliApp. Todos los derechos reservados.</p>
      </footer>
    </div>
  );
};

export default AuthPage;
