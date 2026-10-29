import { Toaster as Sonner, toast } from 'sonner';

export function Toaster() {
  return <Sonner position="top-right" richColors closeButton />;
}

export { toast };
