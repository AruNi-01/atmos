'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  QRCode,
  toastManager,
  cn,
} from '@workspace/ui';
import { LoaderCircle, QrCode, RefreshCw, Smartphone } from 'lucide-react';
import {
  getStoredDeviceCredential,
  hubConfigured,
  hubCreateMobilePair,
} from '@/api/hub-client';

type PairState =
  | { status: 'idle' }
  | { status: 'loading' }
  | {
      status: 'ready';
      qrValue: string;
      expiresAt: number;
      secondsLeft: number;
    }
  | { status: 'error'; message: string };

export function MobilePairQrPanel({ enabled }: { enabled: boolean }) {
  const t = useTranslations('atmosComputer.mobilePair');
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<PairState>({ status: 'idle' });

  const createPair = useCallback(async () => {
    if (!hubConfigured()) {
      setState({ status: 'error', message: t('hubNotConfigured') });
      return;
    }
    if (!getStoredDeviceCredential()?.trim()) {
      setState({ status: 'error', message: t('signInFirst') });
      return;
    }
    setState({ status: 'loading' });
    try {
      const pair = await hubCreateMobilePair({ label: 'Mobile' });
      const expiresAt = pair.expires_at * 1000;
      setState({
        status: 'ready',
        qrValue: pair.qr_value,
        expiresAt,
        secondsLeft: Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000)),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : t('createFailed');
      setState({ status: 'error', message });
      toastManager.add({
        title: t('createFailed'),
        description: message,
        type: 'error',
      });
    }
  }, [t]);

  const openModal = useCallback(() => {
    if (!enabled) return;
    setOpen(true);
    void createPair();
  }, [createPair, enabled]);

  useEffect(() => {
    if (!open || state.status !== 'ready') return;
    const id = window.setInterval(() => {
      setState(prev => {
        if (prev.status !== 'ready') return prev;
        const secondsLeft = Math.max(
          0,
          Math.ceil((prev.expiresAt - Date.now()) / 1000),
        );
        if (secondsLeft <= 0) {
          return { status: 'idle' };
        }
        return { ...prev, secondsLeft };
      });
    }, 250);
    return () => window.clearInterval(id);
  }, [open, state.status === 'ready' ? state.expiresAt : 0]);

  // Reset pair state when the modal closes so the next open fetches a fresh code.
  useEffect(() => {
    if (!open) {
      setState({ status: 'idle' });
    }
  }, [open]);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-muted/10 px-4 py-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Smartphone className="size-4 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">{t('title')}</p>
          </div>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {enabled ? t('description') : t('signInFirst')}
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!enabled}
          onClick={openModal}
        >
          <QrCode className="mr-2 size-4" />
          {t('showQr')}
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[360px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Smartphone className="size-4" />
              {t('title')}
            </DialogTitle>
            <DialogDescription>{t('description')}</DialogDescription>
          </DialogHeader>

          <div className="flex flex-col items-center gap-4 py-2">
            {state.status === 'loading' || state.status === 'idle' ? (
              <div className="flex h-[224px] w-[224px] items-center justify-center rounded-2xl border border-border bg-muted/20">
                <LoaderCircle className="size-8 animate-spin text-muted-foreground" />
              </div>
            ) : null}

            {state.status === 'ready' ? (
              <>
                <div
                  className={cn(
                    'rounded-2xl border border-border bg-background p-3',
                    state.secondsLeft <= 30 && 'border-amber-500/40',
                  )}
                >
                  <QRCode
                    value={state.qrValue}
                    size={200}
                    fgColor="var(--foreground)"
                    bgColor="var(--background)"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  {t('expiresIn', { seconds: state.secondsLeft })}
                </p>
              </>
            ) : null}

            {state.status === 'error' ? (
              <p className="text-center text-xs text-destructive">{state.message}</p>
            ) : null}

            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={state.status === 'loading'}
              onClick={() => void createPair()}
            >
              {state.status === 'loading' ? (
                <LoaderCircle className="mr-2 size-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 size-4" />
              )}
              {t('refresh')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
