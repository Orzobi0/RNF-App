import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { User } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ToastAction } from '@/components/ui/toast';
import { downloadCyclesAsCsv, downloadCyclesAsPdf } from '@/lib/cycleExport';
import ExportCyclesDialog from '@/components/ExportCyclesDialog';
import { useCycleData } from '@/hooks/useCycleData';
import InstallPrompt from '@/components/InstallPrompt';
import { ensureHealthConnectPermissions } from '@/lib/healthConnectSync';

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
  const { currentCycle, archivedCycles, syncHealthConnectTemperatures } = useCycleData();
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
  const forceInstallPrompt = import.meta.env.VITE_FORCE_INSTALL_PROMPT === 'true';
  const [syncingHealthConnect, setSyncingHealthConnect] = useState(false);
  const [lastSyncSummary, setLastSyncSummary] = useState('');

  const isAndroidApp = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';

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

  const handleOpenHealthConnectSettings = async () => {
    try {
      const { HealthConnect } = await import('capacitor-health-connect');
      if (typeof HealthConnect?.openHealthConnectSetting === 'function') {
      await HealthConnect.openHealthConnectSetting();
      return;
    }

    } catch (error) {
      console.error('Error al abrir ajustes de Health Connect', error);
    }

    await App.openSettings();
  };

  const handleSyncHealthConnect = async () => {
    if (!isAndroidApp) return;
    
    let hasPermissions = false;
    try {
      hasPermissions = await ensureHealthConnectPermissions();
    } catch (error) {
      console.error('Error al comprobar permisos de Health Connect', error);
    }

    if (!hasPermissions) {
      toast({
        title: 'Permisos requeridos',
        description: 'Se abrirán los ajustes para concederlos.',
        action: (
          <ToastAction altText="Abrir ajustes" onClick={handleOpenHealthConnectSettings}>
            Abrir ajustes
          </ToastAction>
        ),
      });
      await handleOpenHealthConnectSettings();
      return;
    }

    setSyncingHealthConnect(true);
    try {
      const data = await syncHealthConnectTemperatures();
      if (data) {
        setLastSyncSummary(
          `Nuevos: ${data?.createdMeasurements ?? 0} · Ya estaban: ${data?.skippedMeasurements ?? 0} · Rechazados: ${data?.rejected ?? 0}`
        );
      }
    } catch (error) {
      console.error('Error al sincronizar Health Connect', error);
    } finally {
      setSyncingHealthConnect(false);
    }
  };

  const syncHelperText = (() => {
    if (!isAndroidApp) return 'Disponible solo en la app Android.';
    if (!currentCycle?.id) return 'Necesitas un ciclo actual para sincronizar.';
    if (lastSyncSummary) return lastSyncSummary;
    return 'Sincroniza tus temperaturas basales desde Health Connect.';
  })();

  return (
     <div className="relative flex h-[calc(var(--app-vh,1vh)*100 - var(--bottom-nav-safe))] flex-col overflow-hidden">
      <div
        className="relative z-10 mx-auto flex w-full max-w-2xl flex-1 flex-col box-border px-4 py-6"
        style={{ paddingBottom: 'calc(var(--bottom-nav-safe) + 4rem)' }}
      >
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <h1 className="text-3xl font-bold text-slate-700 flex items-center">
            <User className="mr-2 h-8 w-8 text-fertiliapp-fuerte" />
            Mi cuenta
          </h1>
        </motion.div>

        <div className="mt-6 flex flex-1 flex-col gap-6">
          <div className="space-y-4">
            <div className="bg-white/80 backdrop-blur p-4 rounded-3xl shadow flex items-center justify-between">
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
                 
            <div className="bg-white/80 backdrop-blur p-4 rounded-3xl shadow flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Contraseña</p>
                <p className="font-medium text-slate-700">********</p>
              </div>
              <Button onClick={() => setShowPasswordDialog(true)} className="ml-4">
                Actualizar contraseña
              </Button>
            </div>
          </div>
          
          <div className="bg-white/80 backdrop-blur p-4 rounded-3xl shadow flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">Exportar datos</p>
              <p className="font-medium text-slate-700">
                Descarga tus ciclos
              </p>
            </div>
            <Button onClick={() => setShowExportDialog(true)} className="ml-4">
              Exportar ciclos
            </Button>
          </div>
          
          <div className="bg-white/50 backdrop-blur p-4 rounded-3xl shadow flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm text-slate-500">Sincronizar Health Connect</p>
              <p className="font-medium text-slate-700">
                Importa tus temperaturas
              </p>
              <p className="text-xs text-slate-500 mt-1">{syncHelperText}</p>
            </div>
            <Button
              onClick={handleSyncHealthConnect}
              className="ml-0 sm:ml-4"
              disabled={!isAndroidApp || syncingHealthConnect || !currentCycle?.id}
            >
              {syncingHealthConnect ? 'Sincronizando...' : 'Sincronizar ahora'}
            </Button>
          </div>
          <InstallPrompt
            align="end"
            buttonClassName="bg-fertiliapp-fuerte hover:brightness-95"
            forceVisible={forceInstallPrompt}
          />
        </div>

      </div>

      <div
        className="fixed left-0 right-0 bottom-0 z-20 flex justify-center pointer-events-none"
        style={{ bottom: 'var(--bottom-nav-safe)' }}
      >
        <div className="mx-auto w-full max-w-2xl px-4 pb-6 pointer-events-auto">
          <div className="bg-white/80 backdrop-blur p-4 rounded-3xl shadow flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">Sesión</p>
              <p className="font-medium text-slate-700">Cerrar sesión de tu cuenta</p>
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
