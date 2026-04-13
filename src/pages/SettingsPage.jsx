import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Activity, Bolt, ChevronRight, FileDown, Lock, LogOut, Mail, User } from 'lucide-react';
import { App } from '@capacitor/app';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ToastAction } from '@/components/ui/toast';
import { downloadCyclesAsPdf } from '@/lib/cycleExport';
import ExportCyclesDialog from '@/components/ExportCyclesDialog';
import { useCycleData } from '@/hooks/useCycleData';
import InstallPrompt from '@/components/InstallPrompt';
import { ensureHealthConnectPermissions } from '@/lib/healthConnectSync';
import { useHealthConnect } from '@/contexts/HealthConnectContext.jsx';
import { cn } from '@/lib/utils';
import { Link } from 'react-router-dom';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
const getSettingsIconToneClasses = (tone = 'cool', destructive = false) => {
  if (destructive) return 'bg-red-50 text-red-600';

  switch (tone) {
    case 'warm':
      return 'text-[#F7B944]';
    case 'purple':
      return 'bg-observaciones-suave text-observaciones-fuerte';
    case 'mint':
      return 'text-[#3a8a6e]';
    case 'rose':
      return 'bg-rose-50 text-rose-500';
    case 'cool':
    default:
      return 'text-secundario-fuerte';
  }
};
const SETTINGS_ROW_CLASS =
  'flex w-full items-center justify-between gap-3 rounded-[28px] bg-white/80 px-4 py-3 text-left shadow backdrop-blur transition hover:bg-white/90';

const SettingsActionRow = ({
  icon: Icon,
  title,
  description,
  onClick,
  destructive = false,
  trailing = null,
  ariaLabel,
  iconTone = 'cool',
}) => (
  <button
    type="button"
    onClick={onClick}
    aria-label={ariaLabel ?? title}
    className={cn(SETTINGS_ROW_CLASS, destructive && 'hover:bg-red-50/60')}
  >
    <div className="flex min-w-0 items-start gap-3">
      <span
        className={cn(
          'mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl',
          getSettingsIconToneClasses(iconTone, destructive)
        )}
      >
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>

      <div className="min-w-0">
        <p className={cn('text-base font-semibold text-slate-700', destructive && 'text-red-700')}>
          {title}
        </p>
        {description ? (
          <p className="mt-1 break-all text-sm text-slate-500">{description}</p>
        ) : null}
      </div>
    </div>

    {trailing ? <div className="shrink-0">{trailing}</div> : null}
  </button>
);

const SettingsLinkRow = ({ icon: Icon, title, description, to, ariaLabel, iconTone = 'cool' }) => (
  <Link
    to={to}
    aria-label={ariaLabel ?? title}
    className={SETTINGS_ROW_CLASS}
  >
    <div className="flex min-w-0 items-start gap-3">
      <span
  className={cn(
    'mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl',
    getSettingsIconToneClasses(iconTone)
        )}
      >
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>

      <div className="min-w-0">
        <p className="text-base font-semibold text-slate-700">{title}</p>
        {description ? <p className="mt-0.5 text-sm text-slate-500">{description}</p> : null}
      </div>
    </div>

    <ChevronRight className="h-5 w-5 shrink-0 text-slate-400" aria-hidden="true" />
  </Link>
);

const SettingsSwitchRow = ({
  icon: Icon,
  title,
  description,
  checked,
  onToggle,
  disabled = false,
  ariaLabel,
  iconTone = 'cool',
}) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={ariaLabel ?? title}
    onClick={() => {
      if (disabled) return;
      onToggle(!checked);
    }}
    disabled={disabled}
    className={cn(SETTINGS_ROW_CLASS, 'disabled:cursor-not-allowed disabled:opacity-60')}
  >
    <div className="flex min-w-0 items-start gap-3">
      <span
  className={cn(
    'mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl',
    getSettingsIconToneClasses(iconTone)
  )}
>
  <Icon className="h-5 w-5" aria-hidden="true" />
</span>

      <div className="min-w-0">
        <p className="text-base font-semibold text-slate-700">{title}</p>
        {description ? <p className="mt-0.5 text-sm text-slate-500">{description}</p> : null}
      </div>
    </div>

    <span
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border border-slate-200 transition-colors',
        checked ? 'bg-rose-400' : 'bg-slate-200'
      )}
      aria-hidden="true"
    >
      <span
        className={cn(
          'inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform',
          checked ? 'translate-x-5' : 'translate-x-0'
        )}
      />
    </span>
  </button>
);

const SettingsPage = () => {
  const { user, updateEmail, updatePassword, login, logout } = useAuth();
  const { currentCycle, archivedCycles } = useCycleData();
  const { isAvailable, hasPermissions, refreshPermissions, isChecking, isAndroidApp } =
    useHealthConnect();
  const { toast } = useToast();

  const [showEmailDialog, setShowEmailDialog] = useState(false);
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [selectedCycleIds, setSelectedCycleIds] = useState([]);
  const [pdfContentMode, setPdfContentMode] = useState('chart');
  const [includeRs, setIncludeRs] = useState(true);
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
    setPdfContentMode('chart');
    setIncludeRs(true);
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
      const filename = `ciclos-${timestamp}.pdf`;
      const includeChart = pdfContentMode !== 'table';
      const chartOnly = pdfContentMode === 'chart';

      await downloadCyclesAsPdf(cyclesToExport, filename, {
        includeChart,
        includeRs,
        chartOnly,
      });

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
    const { HealthConnect } = await import('capacitor-health-connect');
    try {
      if (typeof HealthConnect?.openHealthConnectSetting === 'function') {
        await HealthConnect.openHealthConnectSetting();
        return;
      }
      throw new Error('HC_OPEN_SETTINGS_UNAVAILABLE');
    } catch (error) {
      console.error('Error al abrir ajustes de Health Connect', error);
      toast({
        title: 'No se pudo abrir Salud automáticamente',
        description: 'Abre Salud/Health Connect y concede permisos a FertiliApp manualmente.',
        variant: 'destructive',
      });
    }
   };

  const handleHealthConnectToggle = async (nextValue) => {
    if (!isAndroidApp) {
      toast({
        title: 'Disponible solo en Android',
        description: 'Health Connect funciona únicamente en la app Android.',
        variant: 'destructive',
      });
      return;
    }

  if (!nextValue) {
      toast({
        title: 'Revoca desde ajustes',
        description: 'Para revocar permisos ve a los ajustes de Health Connect.',
      });
      await handleOpenHealthConnectSettings();
      await refreshPermissions();
      return;
    }

  let granted = false;
    try {
      granted = await ensureHealthConnectPermissions();
    } catch (error) {
      const msg = String(error?.message || error);
      toast({
        title: 'Health Connect: error pidiendo permisos',
        description: msg,
        variant: 'destructive',
      });
    } finally {
      await refreshPermissions();
    }

    if (!granted) {
      toast({
        title: 'Permisos requeridos',
        description: 'Se abrirá Salud/Health Connect para conceder permisos.',
        action: (
          <ToastAction altText="Abrir Salud" onClick={handleOpenHealthConnectSettings}>
            Abrir Salud
          </ToastAction>
        ),
      });
      await handleOpenHealthConnectSettings();
    }
  };

  useEffect(() => {
    refreshPermissions();
    let listener;
    const attachListener = async () => {
      listener = await App.addListener('appStateChange', ({ isActive }) => {
        if (isActive) {
          refreshPermissions();
        }
      });
    };
    attachListener();
    return () => {
      listener?.remove();
    };
  }, [refreshPermissions]);

  return (
     <div className="relative flex min-h-full flex-col">
      <div
        className="relative z-10 mx-auto flex w-full max-w-2xl flex-1 flex-col box-border px-4 py-6"
      >
        <div className="mb-5 border-b border-rose-100/70 pb-3">
  <motion.div
    initial={{ opacity: 0, y: -20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.5 }}
  >
    <h1 className="flex items-center text-3xl font-bold text-slate-700">
      <User className="mr-2 h-8 w-8 text-fertiliapp-fuerte" />
      Ajustes
    </h1>
  </motion.div>
</div>

        <div className="flex flex-1 flex-col">
  <div className="space-y-3">
    <SettingsActionRow
      icon={Mail}
      iconTone="cool"
      title="Correo electrónico"
      description={user?.email || 'Sin correo'}
      onClick={() => {
        setNewEmail(user?.email || '');
        setShowEmailDialog(true);
      }}
      ariaLabel="Actualizar correo electrónico"
    />

    <SettingsActionRow
      icon={Lock}
      iconTone="cool"
      title="Contraseña"
      description="Cambiar contraseña"
      onClick={() => setShowPasswordDialog(true)}
      ariaLabel="Actualizar contraseña"
    />

    <SettingsActionRow
      icon={FileDown}
      iconTone="warm"
      title="Exportar ciclos"
      description="Selecciona qué ciclos exportar"
      onClick={() => setShowExportDialog(true)}
      ariaLabel="Exportar ciclos"
    />

    <SettingsLinkRow
      icon={Bolt}
      iconTone="mint"
      title="Preferencias"
      description="Registro, cálculo y gráfica"
      to="/settings/preferences"
      ariaLabel="Abrir preferencias"
    />

    {isAndroidApp && (
      <SettingsSwitchRow
        icon={Activity}
        iconTone="purple"
        title="Health Connect"
        description={
          !isAvailable
            ? 'Instala Health Connect para habilitar la sincronización.'
            : hasPermissions
              ? 'Conectado. Puedes sincronizar desde el formulario.'
              : 'Activa permisos para importar tus temperaturas.'
        }
        checked={hasPermissions}
        onToggle={handleHealthConnectToggle}
        disabled={!isAvailable || isChecking}
        ariaLabel="Configurar Health Connect"
      />
    )}

    <InstallPrompt
      align="end"
      buttonClassName="bg-fertiliapp-fuerte hover:brightness-95"
      forceVisible={forceInstallPrompt}
    />
  </div>

  <div className="mt-auto pt-6">
    <div className="mb-4 h-px w-full bg-pink-100/70" />

    <SettingsActionRow
      icon={LogOut}
      iconTone="cool"
      title="Cerrar sesión"
      description="Salir de tu cuenta"
      onClick={() => setShowLogoutDialog(true)}
      destructive
      ariaLabel="Cerrar sesión"
      trailing={
        loadingLogout ? (
          <span className="text-sm font-medium text-red-600">Cerrando...</span>
        ) : null
      }
    />
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
        format="pdf"
        pdfContentMode={pdfContentMode}
        onPdfContentModeChange={setPdfContentMode}
        includeRs={includeRs}
        onIncludeRsChange={setIncludeRs}
        isProcessing={isExporting}
      />
    </div>
  );
};

export default SettingsPage;
