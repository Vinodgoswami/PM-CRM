import { Button } from '@salescrm/ui';
import { FileText, ImageIcon, UploadCloud, X } from 'lucide-react';
import { useState } from 'react';
import { fileProblem } from '../projects/api';

const size = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

/** D-026: pick or drop one invoice / payment slip. Refused files report through `onError` and are not kept. */
export function SlipDropzone({
  id,
  file,
  onChange,
  onError,
}: {
  id: string;
  file: File | null;
  onChange: (file: File | null) => void;
  onError: (message: string | null) => void;
}) {
  const [over, setOver] = useState(false);
  const take = (f: File | undefined) => {
    if (!f) return;
    const problem = fileProblem(f);
    onError(problem);
    if (!problem) onChange(f);
  };

  if (file) {
    const Icon = file.type.startsWith('image/') ? ImageIcon : FileText;
    return (
      <div className="flex items-center gap-3 rounded-lg border border-border bg-surface-raised p-2.5">
        <span className="grid size-9 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
          <Icon className="size-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{file.name}</p>
          <p className="text-xs text-text-muted">{size(file.size)} · stored when you save</p>
        </div>
        <Button type="button" size="icon" variant="ghost" aria-label={`Remove ${file.name}`} onClick={() => onChange(null)}>
          <X className="size-4" />
        </Button>
      </div>
    );
  }

  return (
    <label
      htmlFor={id}
      data-testid="slip-dropzone"
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        take(e.dataTransfer.files[0]);
      }}
      className={`flex cursor-pointer items-center gap-3 rounded-lg border border-dashed p-3 transition-colors focus-within:ring-2 focus-within:ring-primary ${
        over ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/60 hover:bg-accent'
      }`}
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-md bg-accent text-text-muted">
        <UploadCloud className="size-4" aria-hidden />
      </span>
      <span className="min-w-0 text-sm">
        <span className="font-medium text-primary">Choose a file</span> <span className="text-text-muted">or drag it here</span>
        <span className="block text-xs text-text-muted">PDF, image or Office file · up to 25 MB</span>
      </span>
      <input
        id={id}
        type="file"
        className="sr-only"
        accept=".pdf,.png,.jpg,.jpeg,.docx,.xlsx,.pptx,.zip"
        onChange={(e) => {
          take(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
    </label>
  );
}
