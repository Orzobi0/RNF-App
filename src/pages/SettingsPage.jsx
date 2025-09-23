import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { User } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';

const SettingsPage = () => {
  const { user, updateEmail, updatePassword, login, logout } = useAuth();
  const { toast } = useToast();

  const [showEmailDialog, setShowEmailDialog] = useState(false);
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);

  const [newEmail, setNewEmail] = useState(user?.email || '');
  const [loadingEmail, setLoadingEmail] = useState(false);

  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loadingPassword, setLoadingPassword] = useState(false);
  const [loadingLogout, setLoadingLogout] = useState(false);
  const [showLogoutDialog, setShowLogoutDialog] = useState(false);

  const handleEmailSubmit = async (e) => {
    e.preventDefault();
    setLoadingEmail(true);
    try {
      await updateEmail(newEmail);
      toast({ title: 'Correo actualizado' });
      setShowEmailDialog(false);
    } finally {
      setLoadingEmail(false);
    }
  };

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast({
        title: 'Error',
        description: 'Las contraseñas no coinciden',
        variant: 'destructive',
      });
      return;
    }
    setLoadingPassword(true);
    try {
      await login(user?.email, oldPassword);
      await updatePassword(newPassword);
      toast({ title: 'Contraseña actualizada' });
      setShowPasswordDialog(false);
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } finally {
      setLoadingPassword(false);
    }
  };

  const handleLogout = async () => {
    setLoadingLogout(true);
    try {
      await logout();
      toast({ title: 'Sesión cerrada' });
    } catch (error) {
      console.error('Error al cerrar sesión', error);
    } finally {
      setLoadingLogout(false);
      setShowLogoutDialog(false);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-gradient-to-br from-rose-100 via-pink-100 to-rose-100 relative">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(65% 55% at 50% 32%, rgba(244,114,182,0.18) 0%, rgba(244,114,182,0.12) 35%, rgba(244,114,182,0.06) 60%, rgba(244,114,182,0) 100%)',
        }}
      />

      <div className="max-w-2xl mx-auto px-4 py-6 relative z-10 flex flex-col min-h-[100dvh]">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <h1 className="text-3xl font-bold text-slate-700 flex items-center">
            <User className="mr-2 h-8 w-8 text-pink-500" />
            Mi cuenta
          </h1>
        </motion.div>

        <div className="mt-6 space-y-4 flex-1">
          <div className="bg-white/80 backdrop-blur p-4 rounded-xl shadow flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">Correo</p>
              <p className="font-medium text-slate-700 break-all">{user?.email}</p>
            </div>
            <Button
              onClick={() => {
                setNewEmail(user?.email || '');
                setShowEmailDialog(true);
              }}
              className="ml-4"
            >
              Actualizar email
            </Button>
          </div>

          <div className="bg-white/80 backdrop-blur p-4 rounded-xl shadow flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">Contraseña</p>
              <p className="font-medium text-slate-700">********</p>
            </div>
            <Button onClick={() => setShowPasswordDialog(true)} className="ml-4">
              Actualizar contraseña
            </Button>
          </div>
        </div>
        <div className="mt-auto pt-6">
          <div className="bg-white/80 backdrop-blur p-4 rounded-xl shadow flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">Sesión</p>
              <p className="font-medium text-slate-700">Cerrar sesión de tu cuenta actual</p>
            </div>
            <Button
              variant="destructive"
              onClick={() => setShowLogoutDialog(true)}
              className="ml-4"
              disabled={loadingLogout}
            >
              Cerrar sesión
            </Button>
          </div>
        </div>
      </div>
      

      <Dialog open={showEmailDialog} onOpenChange={setShowEmailDialog}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleEmailSubmit} className="space-y-4">
            <DialogHeader>
              <DialogTitle>Actualizar correo</DialogTitle>
              <DialogDescription>
                Introduce el nuevo correo electrónico.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="email">Correo</Label>
              <Input
                id="email"
                type="email"
                required
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowEmailDialog(false)}
                disabled={loadingEmail}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={loadingEmail}>
                {loadingEmail ? 'Actualizando...' : 'Actualizar'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={showPasswordDialog} onOpenChange={setShowPasswordDialog}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <DialogHeader>
              <DialogTitle>Actualizar contraseña</DialogTitle>
              <DialogDescription>Cambia tu contraseña.</DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="current-password">Contraseña actual</Label>
              <Input
                id="current-password"
                type="password"
                required
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
              />
              <Label htmlFor="new-password">Nueva contraseña</Label>
              <Input
                id="new-password"
                type="password"
                required
                minLength={6}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
              <Label htmlFor="confirm-password">Repite la contraseña</Label>
              <Input
                id="confirm-password"
                type="password"
                required
                minLength={6}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowPasswordDialog(false)}
                disabled={loadingPassword}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={loadingPassword}>
                {loadingPassword ? 'Actualizando...' : 'Actualizar'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={showLogoutDialog} onOpenChange={setShowLogoutDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>¿Cerrar sesión?</DialogTitle>
            <DialogDescription>
              Confirma que deseas salir de tu cuenta actual.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowLogoutDialog(false)}
              disabled={loadingLogout}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleLogout}
              disabled={loadingLogout}
            >
              {loadingLogout ? 'Cerrando...' : 'Cerrar sesión'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SettingsPage;
