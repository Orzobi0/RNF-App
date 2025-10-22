import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { User } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { downloadCyclesAsCsv, downloadCyclesAsPdf } from '@/lib/cycleExport';
import ExportCyclesDialog from '@/components/ExportCyclesDialog';
import { useCycleData } from '@/hooks/useCycleData';

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
  const { currentCycle, archivedCycles } = useCycleData();
  const { toast } = useToast();

  const [showEmailDialog, setShowEmailDialog] = useState(false);
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [selectedCycleIds, setSelectedCycleIds] = useState([]);
  const [exportFormat, setExportFormat] = useState('csv');
  const [isExporting, setIsExporting] = useState(false);

  const [newEmail, setNewEmail] = useState(user?.email || '');
  const [loadingEmail, setLoadingEmail] = useState(false);

  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loadingPassword, setLoadingPassword] = useState(false);
  const [loadingLogout, setLoadingLogout] = useState(false);
  const [showLogoutDialog, setShowLogoutDialog] = useState(false);

    const allCycles = useMemo(() => {
    const combined = [];
    if (currentCycle?.id) {
      combined.push({
        id: currentCycle.id,
        name: 'Ciclo actual',
        startDate: currentCycle.startDate,
        endDate: currentCycle.endDate,
        recordCount: currentCycle.data?.length ?? 0,
        type: 'current',
        raw: currentCycle,
      });
    }

    if (Array.isArray(archivedCycles) && archivedCycles.length > 0) {
      archivedCycles.forEach((cycle, index) => {
        combined.push({
          id: cycle.id,
          name: cycle.name || `Ciclo archivado ${index + 1}`,
          startDate: cycle.startDate,
          endDate: cycle.endDate,
          recordCount: cycle.data?.length ?? 0,
          type: 'archived',
          raw: cycle,
        });
      });
    }

    return combined;
  }, [archivedCycles, currentCycle]);

  const resetExportState = () => {
    setSelectedCycleIds([]);
    setExportFormat('csv');
    setIsExporting(false);
  };

  const handleCloseExportDialog = () => {
    setShowExportDialog(false);
    resetExportState();
  };

  const handleToggleCycle = (cycleId, checked) => {
    const isChecked = Boolean(checked);
    setSelectedCycleIds((prev) => {
      const set = new Set(prev);
      if (isChecked) {
        set.add(cycleId);
      } else {
        set.delete(cycleId);
      }
      return Array.from(set);
    });
  };

  const handleToggleAllCycles = (checked) => {
    if (checked) {
      setSelectedCycleIds(allCycles.map((cycle) => cycle.id));
    } else {
      setSelectedCycleIds([]);
    }
  };

  const handleConfirmExport = async () => {
    if (!selectedCycleIds.length) return;

    setIsExporting(true);
    try {
      const cyclesToExport = allCycles
        .filter((cycle) => selectedCycleIds.includes(cycle.id))
        .map((cycle) => cycle.raw)
        .filter(Boolean);

      if (!cyclesToExport.length) {
        toast({
          title: 'Sin ciclos seleccionados',
          description: 'Selecciona al menos un ciclo para exportar.',
          variant: 'destructive',
        });
        setIsExporting(false);
        return;
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `ciclos-${timestamp}.${exportFormat}`;

      if (exportFormat === 'pdf') {
        await downloadCyclesAsPdf(cyclesToExport, filename);
      } else {
        await downloadCyclesAsCsv(cyclesToExport, filename);
      }

      toast({
        title: 'Exportación completada',
        description: 'Los ciclos seleccionados se han exportado correctamente.',
      });
      handleCloseExportDialog();
    } catch (error) {
      console.error('Error al exportar ciclos', error);
      toast({
        title: 'Error al exportar',
        description:
          'No se pudieron exportar los ciclos seleccionados. Inténtalo nuevamente más tarde.',
        variant: 'destructive',
      });
    } finally {
      setIsExporting(false);
    }
  };

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
    <div className="relative flex h-full flex-col overflow-hidden bg-gradient-to-br from-rose-100 via-pink-100 to-rose-100">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(65% 55% at 50% 32%, rgba(244,114,182,0.18) 0%, rgba(244,114,182,0.12) 35%, rgba(244,114,182,0.06) 60%, rgba(244,114,182,0) 100%)',
        }}
      />

      <div className="relative z-10 mx-auto flex w-full max-w-2xl flex-1 flex-col box-border px-4 py-6">
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

        <div className="mt-6 flex flex-1 flex-col gap-6">
          <div className="space-y-4">
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
          
          <div className="bg-white/80 backdrop-blur p-4 rounded-xl shadow flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">Exportar datos</p>
              <p className="font-medium text-slate-700">
                Descarga tus ciclos actuales y archivados
              </p>
            </div>
            <Button onClick={() => setShowExportDialog(true)} className="ml-4">
              Exportar ciclos
            </Button>
          </div>
        </div>

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

      <ExportCyclesDialog
        isOpen={showExportDialog}
        onClose={handleCloseExportDialog}
        cycles={allCycles}
        onConfirm={handleConfirmExport}
        selectedIds={selectedCycleIds}
        onToggleId={handleToggleCycle}
        onToggleAll={handleToggleAllCycles}
        format={exportFormat}
        onFormatChange={setExportFormat}
        isProcessing={isExporting}
      />
    </div>
  );
};

export default SettingsPage;
