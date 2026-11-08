import { Button, Dialog, DialogContent, DialogDescription, DialogTitle } from '@salescrm/ui';
import { createContext, type ReactNode, useCallback, useContext, useState } from 'react';

export interface ConfirmRequest {
  title: string;
  message: string;
  /** The button that goes ahead; "Delete" unless said otherwise. */
  confirmLabel?: string;
}

type Ask = (request: ConfirmRequest) => Promise<boolean>;

const ConfirmContext = createContext<Ask | null>(null);

/**
 * D-060: the app's own "Do you really want to…?" popup, used before every delete instead of the browser's confirm box.
 * Mounted once around the app; `useConfirm()` resolves true on the confirm button and false on Cancel or closing.
 */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState<(ConfirmRequest & { resolve: (ok: boolean) => void }) | null>(null);
  const ask = useCallback<Ask>((request) => new Promise((resolve) => setOpen({ ...request, resolve })), []);
  const answer = (ok: boolean) => {
    open?.resolve(ok);
    setOpen(null);
  };
  return (
    <ConfirmContext.Provider value={ask}>
      {children}
      {open && (
        <Dialog open onOpenChange={(o) => !o && answer(false)}>
          <DialogContent role="alertdialog" className="max-w-md">
            <DialogTitle>{open.title}</DialogTitle>
            <DialogDescription>{open.message}</DialogDescription>
            <div className="mt-5 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => answer(false)}>
                Cancel
              </Button>
              <Button type="button" variant="danger" onClick={() => answer(true)}>
                {open.confirmLabel ?? 'Delete'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): Ask {
  const ask = useContext(ConfirmContext);
  if (!ask) throw new Error('useConfirm needs <ConfirmProvider> around the app');
  return ask;
}
