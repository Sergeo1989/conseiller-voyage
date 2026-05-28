'use client';

// useStepUpGate — helper Client pour orchestrer le step-up avant une
// action sensible.
//
// Pattern d'usage :
//   const { gate, modal } = useStepUpGate('accept_lead', 'Accepter ce lead');
//   <Button onClick={() => gate(() => doActuallyAcceptLead())}>...
//   {modal}
//
// `gate(action)` :
//   1. Appelle checkSessionFreshnessAction pour décider d'ouvrir le modal.
//   2. Si fresh → exécute action() directement.
//   3. Sinon → ouvre le modal step-up ; action() exécutée au succès du
//      step-up.

import { checkSessionFreshnessAction } from '@/features/mfa/actions/stepup.actions';
import { StepUpModal } from '@/features/mfa/ui/StepUpModal';
import type { IntendedAction } from '@cv/mfa';
import { type ReactNode, useCallback, useState } from 'react';
import { createElement } from 'react';

export interface StepUpGate {
  readonly gate: (action: () => void | Promise<void>) => Promise<void>;
  readonly modal: ReactNode;
}

export function useStepUpGate(
  intendedAction: IntendedAction,
  intendedActionLabel: string,
): StepUpGate {
  const [open, setOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => void | Promise<void>) | null>(null);

  const gate = useCallback(async (action: () => void | Promise<void>): Promise<void> => {
    const freshness = await checkSessionFreshnessAction();
    if (freshness.fresh) {
      await action();
      return;
    }
    setPendingAction(() => action);
    setOpen(true);
  }, []);

  const onSuccess = useCallback(async () => {
    if (pendingAction) {
      await pendingAction();
      setPendingAction(null);
    }
  }, [pendingAction]);

  const modal = createElement(StepUpModal, {
    open,
    onOpenChange: setOpen,
    intendedAction,
    intendedActionLabel,
    onSuccess,
  });

  return { gate, modal };
}
