import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
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

const SettingsPage = () => {
  const { user, updateEmail, updatePassword, preferences, savePreferences } = useAuth();
  const [email, setEmail] = useState(user?.email || '');
  const [password, setPassword] = useState('');
  const [theme, setTheme] = useState(preferences?.theme || 'light');
  const [units, setUnits] = useState(preferences?.units || 'metric');

  useEffect(() => {
    setEmail(user?.email || '');
  }, [user]);

  useEffect(() => {
    if (preferences) {
      setTheme(preferences.theme || 'light');
      setUnits(preferences.units || 'metric');
    }
  }, [preferences]);

  const handleEmailSubmit = async (e) => {
    e.preventDefault();
    await updateEmail(email);
  };

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    if (password) {
      await updatePassword(password);
      setPassword('');
    }
  };

  const handlePreferencesSubmit = async (e) => {
    e.preventDefault();
    await savePreferences({ theme, units });
  };

  return (
    <div className="max-w-md mx-auto space-y-8">
      <form onSubmit={handleEmailSubmit} className="space-y-2">
        <Label htmlFor="email">Correo</Label>
        <Input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Button type="submit" className="mt-2">Actualizar correo</Button>
      </form>

      <form onSubmit={handlePasswordSubmit} className="space-y-2">
        <Label htmlFor="password">Contraseña nueva</Label>
        <Input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <Button type="submit" className="mt-2">Actualizar contraseña</Button>
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
        <Button type="submit">Guardar preferencias</Button>
      </form>
    </div>
  );
};

export default SettingsPage;