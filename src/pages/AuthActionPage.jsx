import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { applyActionCode, checkActionCode, confirmPasswordReset, verifyPasswordResetCode } from 'firebase/auth';
import { auth } from '@/lib/firebaseClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Eye, EyeOff } from 'lucide-react';

const REDIRECT_DELAY_MS = 1500;

const AuthActionPage = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const mode = searchParams.get('mode');
  const oobCode = searchParams.get('oobCode');
  const continueUrl = searchParams.get('continueUrl');
  const lang = searchParams.get('lang');

  const [status, setStatus] = useState('loading');
  const [message, setMessage] = useState('Procesando tu solicitud...');
  const [restoredEmail, setRestoredEmail] = useState('');
  const [resetEmail, setResetEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [submittingReset, setSubmittingReset] = useState(false);

  const safeContinueUrl = useMemo(() => {
    if (!continueUrl) return null;
    try {
      const parsed = new URL(continueUrl, window.location.origin);
      return parsed.origin === window.location.origin ? parsed.pathname + parsed.search + parsed.hash : null;
    } catch {
      return null;
    }
  }, [continueUrl]);

  useEffect(() => {
    let timeoutId;

    const runAction = async () => {
      if (!mode || !oobCode) {
        setStatus('error');
        setMessage('Faltan datos en el enlace. Solicita uno nuevo desde FertiliApp.');
        return;
      }

      try {
        if (lang) {
          auth.languageCode = lang;
        }
        if (mode === 'verifyEmail') {
          await applyActionCode(auth, oobCode);
          setStatus('success');
          setMessage('Email verificado correctamente. Redirigiendo a iniciar sesión...');
          timeoutId = window.setTimeout(() => {
            navigate('/auth?verified=1', { replace: true });
          }, REDIRECT_DELAY_MS);
          return;
        }

        if (mode === 'resetPassword') {
          const email = await verifyPasswordResetCode(auth, oobCode);
          setResetEmail(email || '');
          setStatus('ready-reset');
          setMessage('Introduce tu nueva contraseña para completar el restablecimiento.');
          return;
        }

        if (mode === 'recoverEmail') {
          const info = await checkActionCode(auth, oobCode);
          setRestoredEmail(info?.data?.email || '');
          await applyActionCode(auth, oobCode);
          setStatus('success');
          setMessage('Correo restaurado correctamente. Redirigiendo...');
          timeoutId = window.setTimeout(() => {
            navigate(safeContinueUrl || '/auth', { replace: true });
          }, REDIRECT_DELAY_MS);
          return;
        }

        setStatus('error');
        setMessage('Este tipo de enlace no es compatible en FertiliApp.');
      } catch {
        setStatus('error');
        setMessage('El enlace ha caducado o ya se usó. Solicita uno nuevo para continuar.');
      }
    };

    runAction();

    return () => {
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [lang, mode, navigate, oobCode, safeContinueUrl]);

  const handleResetSubmit = async (event) => {
    event.preventDefault();

    if (!newPassword || !confirmPassword) {
      setStatus('ready-reset');
      setMessage('Completa ambos campos de contraseña.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setStatus('ready-reset');
      setMessage('Las contraseñas no coinciden.');
      return;
    }

    try {
      setSubmittingReset(true);
      await confirmPasswordReset(auth, oobCode, newPassword);
      setStatus('success');
      setMessage('Contraseña actualizada. Redirigiendo a iniciar sesión...');
      window.setTimeout(() => {
        navigate('/auth?reset=1', { replace: true });
      }, REDIRECT_DELAY_MS);
    } catch {
      setStatus('error');
      setMessage('No se pudo actualizar la contraseña. Solicita un nuevo enlace.');
    } finally {
      setSubmittingReset(false);
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
          <p className="text-lg text-gray-600">Gestión segura de tu cuenta</p>
        </div>

        <motion.div
          className="space-y-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.25, duration: 0.4 }}
        >
          <p className="rounded-2xl bg-pink-50 px-4 py-3 text-sm text-fertiliapp-fuerte">{message}</p>

          {status === 'ready-reset' && (
            <form onSubmit={handleResetSubmit} className="space-y-4" autoComplete="on">
              {resetEmail ? <p className="text-sm text-gray-600">Cuenta: {resetEmail}</p> : null}

              <div className="space-y-2">
                <Label htmlFor="newPassword">Nueva contraseña</Label>
                <div className="relative">
                  <Input
                    id="newPassword"
                    name="new-password"
                    type={showNewPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    autoComplete="new-password"
                    required
                    className="rounded-3xl pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword((prev) => !prev)}
                    className="absolute inset-y-0 right-3 flex items-center text-gray-500"
                    aria-label={showNewPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  >
                    {showNewPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirmar contraseña</Label>
                <div className="relative">
                  <Input
                    id="confirmPassword"
                    name="confirm-new-password"
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    autoComplete="new-password"
                    required
                    className="rounded-3xl pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((prev) => !prev)}
                    className="absolute inset-y-0 right-3 flex items-center text-gray-500"
                    aria-label={showConfirmPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  >
                    {showConfirmPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
              </div>

              <Button type="submit" disabled={submittingReset} className="w-full rounded-3xl bg-fertiliapp-fuerte text-white">
                {submittingReset ? 'Actualizando...' : 'Guardar nueva contraseña'}
              </Button>
            </form>
          )}

          {status === 'success' && (
            <Button
              type="button"
              onClick={() => navigate(mode === 'verifyEmail' ? '/auth?verified=1' : safeContinueUrl || '/auth', { replace: true })}
              className="w-full rounded-3xl bg-fertiliapp-fuerte text-white"
            >
              Ir a iniciar sesión
            </Button>
          )}

          {status === 'error' && (
            <Button type="button" onClick={() => navigate('/auth', { replace: true })} className="w-full rounded-3xl">
              Volver a iniciar sesión
            </Button>
          )}

          {restoredEmail ? <p className="text-center text-sm text-gray-600">Correo restaurado: {restoredEmail}</p> : null}
        </motion.div>
      </motion.div>
    </div>
  );
};

export default AuthActionPage;