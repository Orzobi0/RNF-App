import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui/use-toast';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

const SettingsPage = () => {
  const {
    user,
    updateEmail,
    updatePassword,
    preferences,
    savePreferences,
    logout,
    updateProfile,
    deleteAccount,
  } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [email, setEmail] = useState(user?.email || '');
  const [password, setPassword] = useState('');
  const [name, setName] = useState(user?.displayName || '');
  const [avatar, setAvatar] = useState(user?.photoURL || '');
  const [theme, setTheme] = useState(preferences?.theme || 'light');
  const [units, setUnits] = useState(preferences?.units || 'metric');
  
  const [loadingEmail, setLoadingEmail] = useState(false);
  const [loadingPassword, setLoadingPassword] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [loadingPrefs, setLoadingPrefs] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);


  useEffect(() => {
    setEmail(user?.email || '');
    setName(user?.displayName || '');
    setAvatar(user?.photoURL || '');
  }, [user]);

  useEffect(() => {
    if (preferences) {
      setTheme(preferences.theme || 'light');
      setUnits(preferences.units || 'metric');
    }
  }, [preferences]);

  const handleEmailSubmit = async (e) => {
    e.preventDefault();
    setLoadingEmail(true);
    try {
      await updateEmail(email);
      toast({ title: 'Correo actualizado' });
    } finally {
      setLoadingEmail(false);
    }
  };

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    if (!password) return;
    setLoadingPassword(true);
    try {
      await updatePassword(password);
      setPassword('');
            toast({ title: 'Contraseña actualizada' });
    } finally {
      setLoadingPassword(false);
    }
  };

  const handleProfileSubmit = async (e) => {
    e.preventDefault();
    setLoadingProfile(true);
    try {
      await updateProfile({ displayName: name, photoURL: avatar });
      toast({ title: 'Perfil actualizado' });
    } finally {
      setLoadingProfile(false);
    }
  };

  const handlePreferencesSubmit = async (e) => {
    e.preventDefault();
    setLoadingPrefs(true);
    try {
      await savePreferences({ theme, units });
      toast({ title: 'Preferencias guardadas' });
    } finally {
      setLoadingPrefs(false);
    }
  };

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await logout();
      navigate('/auth');
    } finally {
      setLoggingOut(false);
    }
  };

  const confirmDeleteAccount = async () => {
    setDeletingAccount(true);
    try {
      await deleteAccount();
      navigate('/auth');
    } finally {
      setDeletingAccount(false);
      setShowDeleteDialog(false);
    }
  };

  return (
    <div className="max-w-md mx-auto space-y-8">
      <form onSubmit={handleEmailSubmit} className="space-y-2">
        <Label htmlFor="email">Correo</Label>
        <Input
          id="email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Button type="submit" className="mt-2" disabled={loadingEmail}>
          {loadingEmail ? 'Actualizando...' : 'Actualizar correo'}
        </Button>
      </form>

      <form onSubmit={handlePasswordSubmit} className="space-y-2">
        <Label htmlFor="password">Contraseña nueva</Label>
        <Input
          id="password"
          type="password"
          required
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <Button type="submit" className="mt-2" disabled={loadingPassword}>
          {loadingPassword ? 'Actualizando...' : 'Actualizar contraseña'}
        </Button>
      </form>

      <form onSubmit={handleProfileSubmit} className="space-y-2">
        <Label htmlFor="name">Nombre</Label>
        <Input
          id="name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Label htmlFor="avatar">URL del avatar</Label>
        <Input
          id="avatar"
          type="url"
          value={avatar}
          onChange={(e) => setAvatar(e.target.value)}
        />
        <Button type="submit" className="mt-2" disabled={loadingProfile}>
          {loadingProfile ? 'Guardando...' : 'Actualizar perfil'}
        </Button>
      </form>

      <form onSubmit={handlePreferencesSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label>Tema</Label>
          <Select value={theme} onValueChange={setTheme}>
            <SelectTrigger>
              <SelectValue placeholder="Tema" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="light">Claro</SelectItem>
              <SelectItem value="dark">Oscuro</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Unidades</Label>
          <Select value={units} onValueChange={setUnits}>
            <SelectTrigger>
              <SelectValue placeholder="Unidades" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="metric">Métrico</SelectItem>
              <SelectItem value="imperial">Imperial</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button type="submit" disabled={loadingPrefs}>
          {loadingPrefs ? 'Guardando...' : 'Guardar preferencias'}
        </Button>
      </form>
      
      <div className="space-y-2">
        <Button variant="outline" onClick={handleLogout} disabled={loggingOut} className="w-full">
          {loggingOut ? 'Cerrando...' : 'Cerrar sesión'}
        </Button>
        <Button
          variant="destructive"
          onClick={() => setShowDeleteDialog(true)}
          className="w-full"
        >
          Eliminar cuenta
        </Button>
      </div>

      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Eliminar cuenta?</DialogTitle>
            <DialogDescription>
              Esta acción es irreversible. Todos tus datos serán eliminados.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDeleteDialog(false)}
              disabled={deletingAccount}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDeleteAccount}
              disabled={deletingAccount}
            >
              {deletingAccount ? 'Eliminando...' : 'Eliminar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SettingsPage;