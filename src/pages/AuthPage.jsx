
    import React, { useState } from 'react';
    import { useAuth } from '@/contexts/AuthContext';
    import { useNavigate } from 'react-router-dom';
    import { Button } from '@/components/ui/button';
    import { Input } from '@/components/ui/input';
    import { Label } from '@/components/ui/label';
    import { useToast } from '@/components/ui/use-toast';
    import { motion } from 'framer-motion';
    import { LogIn, UserPlus, Mail, KeyRound } from 'lucide-react';

    const AuthPage = () => {
      const [isLogin, setIsLogin] = useState(true);
      const [email, setEmail] = useState('');
      const [password, setPassword] = useState('');
      const [confirmPassword, setConfirmPassword] = useState('');
      const { login, register } = useAuth();
      const navigate = useNavigate();
      const { toast } = useToast();
      const [loading, setLoading] = useState(false);

      const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
          if (isLogin) {
            await login(email, password);
            toast({ title: "Inicio de sesión exitoso", description: "Bienvenida de nuevo." });
            navigate('/');
          } else {
            if (password !== confirmPassword) {
              toast({ title: "Error de registro", description: "Las contraseñas no coinciden.", variant: "destructive" });
              setLoading(false);
              return;
            }
            await register(email, password);
            toast({ title: "Registro exitoso", description: "Tu cuenta ha sido creada." });
            navigate('/');
          }
        } catch (error) {
          toast({ title: isLogin ? "Error al iniciar sesión" : "Error al registrarse", description: error.message, variant: "destructive" });
          setLoading(false);
        }
      };

      return (
        <div className="min-h-screen bg-gradient-to-br from-purple-950 to-gray-900 flex flex-col justify-center items-center p-4">
          <motion.div 
            className="w-full max-w-md bg-slate-800/70 backdrop-blur-md shadow-2xl rounded-xl p-8 sm:p-10"
            initial={{ opacity: 0, y: -30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
          >
            <div className="text-center mb-8">
              <motion.h1 
                className="text-3xl sm:text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-rose-400 via-pink-400 to-fuchsia-500 py-2 mb-2"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.2, duration: 0.5 }}
              >
                FertiliApp
              </motion.h1>
              <p className="text-slate-400 text-lg">{isLogin ? 'Inicia sesión para continuar' : 'Crea tu cuenta'}</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="email" className="flex items-center text-slate-300 text-lg">
                <Mail className="mr-2 h-5 w-5 text-pink-400" /> Correo Electrónico
                </Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="tu@email.com"
                  required
                  className="bg-slate-700 border-slate-600 text-slate-50 placeholder-slate-400 focus:ring-pink-500 focus:border-pink-500 text-base py-3 px-4"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="flex items-center text-slate-300 text-lg">
                  <KeyRound className="mr-2 h-5 w-5 text-rose-400" /> Contraseña
                </Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="bg-slate-700 border-slate-600 text-slate-50 placeholder-slate-400 focus:ring-pink-500 focus:border-pink-500 text-base py-3 px-4"
                />
              </div>

              {!isLogin && (
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword" className="flex items-center text-slate-300 text-lg">
                    <KeyRound className="mr-2 h-5 w-5 text-rose-400" /> Confirmar Contraseña
                  </Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    className="bg-slate-700 border-slate-600 text-slate-50 placeholder-slate-400 focus:ring-pink-500 focus:border-pink-500 text-base py-3 px-4"
                  />
                </div>
              )}

              <Button 
                type="submit" 
                disabled={loading}
                className="w-full bg-gradient-to-r from-pink-500 to-fuchsia-600 hover:from-pink-600 hover:to-fuchsia-700 text-white font-semibold py-3 text-lg shadow-md hover:shadow-lg transition-all duration-300 transform hover:scale-102 flex items-center justify-center"
              >
                {loading ? (
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                ) : (
                  isLogin ? <><LogIn className="mr-2 h-5 w-5" /> Iniciar Sesión</> : <><UserPlus className="mr-2 h-5 w-5" /> Registrarse</>
                )}
              </Button>
            </form>

            <div className="mt-8 text-center">
              <Button
                variant="link"
                onClick={() => setIsLogin(!isLogin)}
                className="text-purple-400 hover:text-purple-300 text-base"
              >
                {isLogin ? '¿No tienes cuenta? Regístrate' : '¿Ya tienes cuenta? Inicia sesión'}
              </Button>
            </div>
          </motion.div>
           <footer className="w-full max-w-md mt-12 text-center text-slate-500 text-sm">
              <p>&copy; {new Date().getFullYear()} Seguimiento de Fertilidad. Todos los derechos reservados.</p>
              <p>Creado con Hostinger Horizons.</p>
            </footer>
        </div>
      );
    };

    export default AuthPage;
  