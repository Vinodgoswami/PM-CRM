import { ALLOWED_DOCUMENT_MIME_TYPES, DOCUMENT_TYPES, MAX_DOCUMENT_BYTES, type ProjectDetail } from '@salescrm/schemas';
import { Button, EmptyState, Label, Skeleton, Table, TBody, TD, TH, THead, TR, toast } from '@salescrm/ui';
import { Download, FileText, Trash2, UploadCloud } from 'lucide-react';
import { useId, useState } from 'react';
import { formatDate } from '../../../lib/dates';
import { OptionSelect } from '../../../components/OptionSelect';
import { documentDownloadUrl, useDeleteDocument, useDocuments, useUploadDocument } from '../api';
import { useConfirm } from '../../../components/ConfirmDialog';

type DocType = (typeof DOCUMENT_TYPES)[number];
export const TYPE_LABEL: Record<DocType, string> = {
  PROPOSAL: 'Proposal',
  SOW: 'SOW',
  CONTRACT: 'Contract',
  INVOICE: 'Invoice',
  OTHER: 'Other',
};

const size = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

export function DocumentsTab({ project }: { project: ProjectDetail }) {
  const docs = useDocuments(project.id);
  const upload = useUploadDocument(project.id);
  const del = useDeleteDocument(project.id);
  const confirm = useConfirm();
  const [type, setType] = useState<DocType>('PROPOSAL');
  const inputId = useId();
  const [over, setOver] = useState(false);

  const onFile = (file: File | undefined) => {
    if (!file) return;
    if (!(ALLOWED_DOCUMENT_MIME_TYPES as readonly string[]).includes(file.type))
      return toast.error('Use PDF, Office, PNG, JPG or ZIP files.');
    if (file.size > MAX_DOCUMENT_BYTES) return toast.error('Files can be at most 25 MB.');
    upload.mutate({ file, type }, { onSuccess: () => toast.success(`${file.name} uploaded`), onError: (e) => toast.error(e.message) });
  };

  return (
    <div className="space-y-4">
      {project.canEdit && (
        <section aria-label="Documents upload" className="space-y-3 rounded-xl bg-surface p-4 shadow-card">
          <div className="grid gap-3 sm:grid-cols-[12rem_1fr] sm:items-end">
            <div className="space-y-1.5">
              <Label htmlFor={`${inputId}-type`} className="block">
                Type
              </Label>
              <OptionSelect
                id={`${inputId}-type`}
                className="h-11 w-full rounded-lg border border-border bg-surface px-3 text-sm"
                value={type}
                onValueChange={(v) => setType(v as DocType)}
              >
                {DOCUMENT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {TYPE_LABEL[t]}
                  </option>
                ))}
              </OptionSelect>
            </div>
            <label
              htmlFor={inputId}
              onDragOver={(e) => {
                e.preventDefault();
                setOver(true);
              }}
              onDragLeave={() => setOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setOver(false);
                onFile(e.dataTransfer.files[0]);
              }}
              className={`flex h-11 cursor-pointer items-center gap-3 rounded-lg border border-dashed px-3 transition-colors focus-within:ring-2 focus-within:ring-primary ${
                over ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/60 hover:bg-accent'
              } ${upload.isPending ? 'pointer-events-none opacity-60' : ''}`}
            >
              <UploadCloud className="size-4 shrink-0 text-primary" aria-hidden />
              <span className="min-w-0 truncate text-sm">
                {upload.isPending ? (
                  'Uploading…'
                ) : (
                  <>
                    <span className="font-medium text-primary">Choose a file</span>{' '}
                    <span className="text-text-muted">or drag it here · PDF, Office, PNG, JPG or ZIP · up to 25 MB</span>
                  </>
                )}
              </span>
              <input
                id={inputId}
                type="file"
                className="sr-only"
                aria-label="Upload a document"
                accept={ALLOWED_DOCUMENT_MIME_TYPES.join(',')}
                disabled={upload.isPending}
                onChange={(e) => {
                  onFile(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
            </label>
          </div>
        </section>
      )}

      {docs.isPending ? (
        <Skeleton className="h-20 w-full" />
      ) : docs.isError ? (
        <EmptyState title="Could not load documents" />
      ) : docs.data.items.length === 0 ? (
        <div className="flex items-center gap-3 rounded-xl bg-surface px-4 py-5 shadow-card">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-accent text-text-muted">
            <FileText className="size-5" aria-hidden />
          </span>
          <div>
            <p className="font-medium">No documents yet</p>
            <p className="text-sm text-text-muted">Proposals, SOWs and contracts for this project appear here.</p>
          </div>
        </div>
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Name</TH>
              <TH>Type</TH>
              <TH>Size</TH>
              <TH>Uploaded</TH>
              <TH className="w-24" />
            </TR>
          </THead>
          <TBody>
            {docs.data.items.map((d) => (
              <TR key={d.id}>
                <TD className="max-w-64 truncate font-medium">{d.name}</TD>
                <TD>
                  {TYPE_LABEL[d.type]}
                  {d.paymentId && <span className="ml-1 text-xs text-text-muted">· with a payment</span>}
                </TD>
                <TD>{size(d.sizeBytes)}</TD>
                <TD>
                  {formatDate(d.createdAt)} · {d.uploadedBy.name}
                </TD>
                <TD className="text-right">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Download ${d.name}`}
                    onClick={async () => {
                      try {
                        window.location.assign(await documentDownloadUrl(d.id));
                      } catch (e) {
                        toast.error((e as Error).message);
                      }
                    }}
                  >
                    <Download className="size-4" />
                  </Button>
                  {project.canEdit && (
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Delete ${d.name}`}
                      onClick={() =>
                        void confirm({
                          title: `Delete ${d.name}?`,
                          message: `Do you really want to delete ${d.name}? This cannot be undone.`,
                        }).then((ok) => ok && del.mutate(d.id))
                      }
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  )}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </div>
  );
}
