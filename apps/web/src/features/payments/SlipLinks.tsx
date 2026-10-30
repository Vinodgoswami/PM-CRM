import { type PaymentDto } from '@salescrm/schemas';
import { Button, toast } from '@salescrm/ui';
import { FileText } from 'lucide-react';
import { documentDownloadUrl } from '../projects/api';

/** D-026: download buttons for the invoices / payment slips stored with a payment. */
export function SlipLinks({ payment }: { payment: Pick<PaymentDto, 'documents'> }) {
  return payment.documents.map((d) => (
    <Button
      key={d.id}
      size="sm"
      variant="ghost"
      className="max-w-40"
      aria-label={`Download ${d.name}`}
      title={d.name}
      onClick={async () => {
        try {
          window.location.assign(await documentDownloadUrl(d.id));
        } catch (e) {
          toast.error((e as Error).message);
        }
      }}
    >
      <FileText className="size-4 shrink-0" /> <span className="truncate">{d.name}</span>
    </Button>
  ));
}
