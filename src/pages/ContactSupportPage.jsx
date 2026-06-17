import React, { useEffect, useState } from 'react';
import { ArrowLeft, Copy, Mail } from 'lucide-react';
import { httpsCallable } from 'firebase/functions';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import { functions as firebaseFunctions } from '@/lib/firebaseClient';
import { useWhatsNew } from '@/contexts/WhatsNewContext.jsx';

const CONTACT_EMAIL = 'info@fertiliapp.com';
const SUPPORT_TYPES = {
  problem: 'Problema',
  question: 'Duda',
  suggestion: 'Sugerencia',
};

const ContactSupportPage = () => {
  const { toast } = useToast();
  const { markSupportSeen } = useWhatsNew();
  const [supportType, setSupportType] = useState('problem');
  const [supportSubject, setSupportSubject] = useState('');
  const [supportMessage, setSupportMessage] = useState('');
  const [sendingSupportMessage, setSendingSupportMessage] = useState(false);
  const [sentSuccessfully, setSentSuccessfully] = useState(false);

  useEffect(() => {
    markSupportSeen();
  }, [markSupportSeen]);

  const handleOpenSupportEmail = () => {
    window.location.href = `mailto:${CONTACT_EMAIL}`;
  };

  const handleCopySupportEmail = async () => {
    if (typeof navigator === 'undefined' || !navigator.clipboard) {
      toast({
        title: 'No se pudo copiar',
        description: `Escribe a ${CONTACT_EMAIL}`,
        variant: 'destructive',
      });
      return;
    }

    try {
      await navigator.clipboard.writeText(CONTACT_EMAIL);
      toast({
        title: 'Correo copiado',
        description: 'Puedes pegarlo en tu app de correo.',
      });
    } catch (error) {
      toast({
        title: 'No se pudo copiar',
        description: `Escribe a ${CONTACT_EMAIL}`,
        variant: 'destructive',
      });
    }
  };

  const handleSupportSubmit = async (e) => {
    e.preventDefault();
    setSentSuccessfully(false);

    const trimmedSubject = supportSubject.trim();
    const trimmedMessage = supportMessage.trim();

    if (!SUPPORT_TYPES[supportType]) {
      toast({
        title: 'Revisa el tipo de mensaje',
        description: 'Selecciona problema, duda o sugerencia.',
        variant: 'destructive',
      });
      return;
    }
    if (!trimmedSubject) {
      toast({
        title: 'Asunto obligatorio',
        description: 'Escribe un asunto para tu mensaje.',
        variant: 'destructive',
      });
      return;
    }
    if (trimmedSubject.length > 120) {
      toast({
        title: 'Asunto demasiado largo',
        description: 'El asunto no puede superar 120 caracteres.',
        variant: 'destructive',
      });
      return;
    }
    if (!trimmedMessage) {
      toast({
        title: 'Mensaje obligatorio',
        description: 'Escribe tu consulta antes de enviarla.',
        variant: 'destructive',
      });
      return;
    }
    if (trimmedMessage.length > 3000) {
      toast({
        title: 'Mensaje demasiado largo',
        description: 'El mensaje no puede superar 3000 caracteres.',
        variant: 'destructive',
      });
      return;
    }

    setSendingSupportMessage(true);
    try {
      const sendSupportMessage = httpsCallable(firebaseFunctions, 'sendSupportMessage');
      const result = await sendSupportMessage({
        type: supportType,
        subject: trimmedSubject,
        message: trimmedMessage,
      });

      if (result?.data?.ok) {
        toast({
          title: 'Mensaje enviado',
          description: 'Te responderemos en cuanto sea posible.',
        });
        setSupportSubject('');
        setSupportMessage('');
        setSentSuccessfully(true);
      }
    } catch (error) {
      const code = String(error?.code || '').replace(/^functions\//, '');
      const messages = {
        'resource-exhausted': {
          title: 'Espera unos minutos',
          description: 'Espera unos minutos antes de enviar otro mensaje.',
        },
        unauthenticated: {
          title: 'Inicia sesión',
          description: 'Inicia sesión para enviar un mensaje.',
        },
        'invalid-argument': {
          title: 'Revisa los campos',
          description: 'Completa tipo, asunto y mensaje antes de enviar.',
        },
      };
      const fallback = {
        title: 'No se pudo enviar',
        description: 'No se pudo enviar el mensaje. Inténtalo más tarde.',
      };
      const cleanMessage = messages[code] || fallback;
      toast({
        ...cleanMessage,
        variant: 'destructive',
      });
    } finally {
      setSendingSupportMessage(false);
    }
  };

  return (
    <div className="relative flex min-h-full flex-col bg-slate-50">
      <div className="sticky top-0 z-30 border-b border-slate-100 bg-slate-50/95 px-4 py-4">
        <div className="relative mx-auto w-full max-w-2xl">
          <Link
            to="/settings"
            aria-label="Volver a ajustes"
            className="absolute -left-1 top-0 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-fertiliapp-fuerte transition hover:bg-rose-50 active:bg-rose-100"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          </Link>

          <div className="min-w-0 pl-9">
            <p className="truncate text-xs font-semibold text-fertiliapp-fuerte">
              Volver a Ajustes
            </p>
            <h1 className="truncate text-[24px] font-semibold leading-tight text-titulo">
              Contacto y soporte
            </h1>
            <p className="mt-1 truncate text-sm font-medium text-subtitulo">
              Escribe a través del formulario o al email
            </p>
          </div>
        </div>
      </div>

      <main className="relative z-10 mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 pb-8 pt-4">
        <form onSubmit={handleSupportSubmit} className="space-y-4">
          {sentSuccessfully ? (
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
              Mensaje enviado correctamente.
            </div>
          ) : null}

          <div className="rounded-2xl border border-slate-100 bg-white px-4 py-4">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="support-type" className="text-sm font-semibold text-slate-700">
                  Tipo
                </Label>
                <Select
                  value={supportType}
                  onValueChange={setSupportType}
                  disabled={sendingSupportMessage}
                >
                  <SelectTrigger
                    id="support-type"
                    className="min-h-11 rounded-xl border-slate-200 bg-white text-titulo"
                  >
                    <SelectValue placeholder="Selecciona un tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="problem">Problema</SelectItem>
                    <SelectItem value="question">Duda</SelectItem>
                    <SelectItem value="suggestion">Sugerencia</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="support-subject" className="text-sm font-semibold text-slate-700">
                  Asunto
                </Label>
                <Input
                  id="support-subject"
                  value={supportSubject}
                  onChange={(e) => {
                    setSupportSubject(e.target.value);
                    setSentSuccessfully(false);
                  }}
                  maxLength={120}
                  disabled={sendingSupportMessage}
                  className="min-h-11 rounded-xl border-slate-200 bg-white text-titulo"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="support-message" className="text-sm font-semibold text-slate-700">
                  Mensaje
                </Label>
                <Textarea
                  id="support-message"
                  value={supportMessage}
                  onChange={(e) => {
                    setSupportMessage(e.target.value);
                    setSentSuccessfully(false);
                  }}
                  maxLength={3000}
                  disabled={sendingSupportMessage}
                  className="min-h-36 resize-none rounded-xl border-slate-200 bg-white text-titulo"
                />
              </div>

              <Button
                type="submit"
                disabled={sendingSupportMessage}
                className="min-h-11 w-full bg-fertiliapp-fuerte text-white hover:brightness-95"
              >
                {sendingSupportMessage ? 'Enviando...' : 'Enviar mensaje'}
              </Button>
            </div>
          </div>
        </form>

        <div className="mt-5 overflow-hidden rounded-2xl border border-slate-100 bg-white">
          <button
            type="button"
            onClick={handleCopySupportEmail}
            aria-label={`Copiar correo de contacto ${CONTACT_EMAIL}`}
            className="flex min-h-16 w-full items-center justify-between gap-3 bg-white px-4 py-3 text-left transition hover:bg-slate-50"
          >
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-slate-800">Correo de contacto</span>
              <span className="mt-1 block break-all text-sm font-medium text-fertiliapp-fuerte">
                {CONTACT_EMAIL}
              </span>
            </span>
            <Copy className="h-5 w-5 shrink-0 text-fertiliapp-fuerte" aria-hidden="true" />
          </button>

          <Button
            type="button"
            variant="outline"
            onClick={handleOpenSupportEmail}
            className="min-h-11 w-full rounded-none border-x-0 border-b-0 border-t border-slate-100 bg-white text-fertiliapp-fuerte hover:bg-slate-50"
          >
            <Mail className="mr-2 h-4 w-4" aria-hidden="true" />
            Abrir correo
          </Button>
        </div>
      </main>
    </div>
  );
};

export default ContactSupportPage;
