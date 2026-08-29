'use client';

import { useTranslations } from 'next-intl';
import { AnimatePresence, motion } from 'motion/react';
import {
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
  cn,
} from '@workspace/ui';
import { AlertCircle, ArrowRight, Loader2, RefreshCw } from 'lucide-react';

export type OnboardingStepId = 'intro' | 'check' | 'agents' | 'quota' | 'project';

export interface OnboardingStepActionsProps {
  step: OnboardingStepId;
  /** Called when primary navigation should change step */
  onGoToStep: (step: OnboardingStepId) => void;
  onComplete: () => void;
  // check
  envChecking: boolean;
  hasMissingDeps: boolean;
  onRecheckEnv: () => void;
  // agents
  agentsChecking: boolean;
  agentsSaving: boolean;
  onAgentsContinue: () => void;
  onRecheckAgents: () => void;
  // quota usage
  quotaSaving: boolean;
  onQuotaContinue: () => void;
  onQuotaSkip: () => void;
  // project
  canSubmitProject: boolean;
  isSubmitting: boolean;
  projectFormId: string;
}

export function OnboardingStepActions({
  step,
  onGoToStep,
  onComplete,
  envChecking,
  hasMissingDeps,
  onRecheckEnv,
  agentsChecking,
  agentsSaving,
  onAgentsContinue,
  onRecheckAgents,
  quotaSaving,
  onQuotaContinue,
  onQuotaSkip,
  canSubmitProject,
  isSubmitting,
  projectFormId,
}: OnboardingStepActionsProps) {
  const t = useTranslations('onboarding');

  return (
    <div className="relative min-h-11 overflow-hidden">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div
          key={step}
          initial={{ opacity: 0, scale: 0.94, y: 6 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 4 }}
          transition={{
            type: 'spring',
            stiffness: 480,
            damping: 32,
            mass: 0.65,
            opacity: { duration: 0.12 },
          }}
          className="flex flex-wrap items-center gap-3 origin-left"
        >
          {step === 'intro' && (
            <Button
              onClick={() => onGoToStep('check')}
              className="rounded-full px-6 font-medium gap-2 group cursor-pointer"
            >
              {t('intro.next')}
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
            </Button>
          )}

          {step === 'check' && (
            <>
              <Button
                onClick={() => onGoToStep('agents')}
                className="rounded-full px-6 font-medium cursor-pointer"
                disabled={envChecking || hasMissingDeps}
              >
                {t('check.next')}
              </Button>
              <Button
                variant="outline"
                onClick={onRecheckEnv}
                disabled={envChecking}
                className="rounded-full px-6 font-medium gap-2 border-border/40 hover:bg-muted/20 cursor-pointer"
              >
                <RefreshCw className={cn('size-3.5', envChecking && 'animate-spin')} />
                {t('check.recheck')}
              </Button>
              {hasMissingDeps && !envChecking ? (
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="ghost"
                      className="rounded-full px-4 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
                    >
                      {t('check.skip')}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    align="start"
                    className="w-72 space-y-3 rounded-2xl border border-border bg-popover p-4 text-popover-foreground shadow-xl"
                  >
                    <div className="space-y-1.5">
                      <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                        <AlertCircle className="size-3.5 shrink-0 text-amber-500" />
                        {t('check.skipWarning.title')}
                      </p>
                      <p className="text-xs leading-relaxed text-muted-foreground">
                        {t('check.skipWarning.description')}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onGoToStep('agents')}
                      className="w-full cursor-pointer rounded-full text-xs"
                    >
                      {t('check.skipWarning.confirm')}
                    </Button>
                  </PopoverContent>
                </Popover>
              ) : (
                <Button
                  variant="ghost"
                  onClick={() => onGoToStep('agents')}
                  disabled={envChecking}
                  className="rounded-full px-4 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  {t('check.skip')}
                </Button>
              )}
            </>
          )}

          {step === 'agents' && (
            <>
              <Button
                onClick={onAgentsContinue}
                disabled={agentsChecking || agentsSaving}
                className="rounded-full px-6 font-medium cursor-pointer"
              >
                {agentsSaving ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                {agentsSaving ? t('agents.provisioning') : t('agents.next')}
              </Button>
              <Button
                variant="outline"
                onClick={onRecheckAgents}
                disabled={agentsChecking || agentsSaving}
                className="rounded-full px-6 font-medium gap-2 border-border/40 hover:bg-muted/20 cursor-pointer"
              >
                <RefreshCw className={cn('size-3.5', agentsChecking && 'animate-spin')} />
                {t('agents.recheck')}
              </Button>
              <Button
                variant="ghost"
                onClick={() => onGoToStep('quota')}
                disabled={agentsSaving}
                className="rounded-full px-4 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
              >
                {t('agents.skip')}
              </Button>
            </>
          )}

          {step === 'quota' && (
            <>
              <Button
                onClick={onQuotaContinue}
                disabled={quotaSaving}
                className="rounded-full px-6 font-medium cursor-pointer"
              >
                {quotaSaving ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                {t('quota.next')}
              </Button>
              <Button
                variant="ghost"
                onClick={onQuotaSkip}
                disabled={quotaSaving}
                className="rounded-full px-4 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
              >
                {t('quota.skip')}
              </Button>
            </>
          )}

          {step === 'project' && (
            <>
              <Button
                type="submit"
                form={projectFormId}
                disabled={!canSubmitProject}
                className="rounded-full px-6 font-medium cursor-pointer"
              >
                {isSubmitting ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                {t('project.submit')}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={onComplete}
                className="rounded-full px-4 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
              >
                {t('project.next')}
              </Button>
            </>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
