import { ALLOWED_DOCUMENT_MIME_TYPES, DOCUMENT_TYPES, MAX_DOCUMENT_BYTES, type ProjectDetail } from '@salescrm/schemas';
import { Button, EmptyState, Label, Skeleton, Table, TBody, TD, TH, THead, TR, toast } from '@salescrm/ui';
import { Download, Trash2, Upload } from 'lucide-react';
import { useId, useState } from 'react';
import { formatDate } from '../../../lib/dates';
import { documentDownloadUrl, useDeleteDocument, useDocuments, useUploadDocument } from '../api';

type DocType = (typeof DOCUMENT_TYPES)[number];
const TYPE_LABEL: Record<DocType, string> = { PROPOSAL: 'Proposal', SOW: 'SOW', CONTRACT: 'Contract', INVOICE: 'Invoice', OTHER: 'Other' };

const size = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

export function DocumentsTab({ project }: { project: ProjectDetail }) {
  const docs = useDocuments(project.id);
  const upload = useUploadDocument(project.id);
  const del = useDeleteDocument(project.id);
  const [type, setType] = useState<DocType>('PROPOSAL');
  const inputId = useId();

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
        <div className="flex flex-wrap items-end gap-3 rounded-lg border border-dashed border-border p-4">
          <div className="space-y-1.5">
            <Label htmlFor={`${inputId}-type`}>Type</Label>
            <select
              id={`${inputId}-type`}
              className="h-9 rounded-md border border-border bg-surface px-3 text-sm"
              value={type}
              onChange={(e) => setType(e.target.value as DocType)}
            >
              {DOCUMENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {TYPE_LABEL[t]}
                </option>
              ))}
            </select>
          </div>
          <label
            htmlFor={inputId}
            className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-contrast"
          >
            <Upload className="size-4" /> {upload.isPending ? 'Uploading…' : 'Choose file'}
          </label>
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
          <p className="text-xs text-text-muted">PDF, Office, PNG, JPG or ZIP · up to 25 MB</p>
        </div>
      )}

      {docs.isPending ? (
        <Skeleton className="h-20 w-full" />
      ) : docs.isError ? (
        <EmptyState title="Could not load documents" />
      ) : docs.data.items.length === 0 ? (
        <EmptyState title="No documents yet" description="Proposals, SOWs and contracts for this project appear here." />
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
                <TD>{TYPE_LABEL[d.type]}</TD>
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
                      onClick={() => window.confirm(`Delete ${d.name}?`) && del.mutate(d.id)}
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
