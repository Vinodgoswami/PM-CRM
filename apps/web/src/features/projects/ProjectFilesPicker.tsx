import { DOCUMENT_TYPES } from '@salescrm/schemas';
import { Button, toast } from '@salescrm/ui';
import { FileText, UploadCloud, X } from 'lucide-react';
import { useId, useState } from 'react';
import { OptionSelect } from '../../components/OptionSelect';
import { fileProblem } from './api';
import { TYPE_LABEL } from './tabs/DocumentsTab';

export type DocType = (typeof DOCUMENT_TYPES)[number];
export interface PickedFile {
  key: string;
  file: File;
  type: DocType;
}

/** A first guess from the file name; the user can change it. */
const guessType = (name: string): DocType => {
  const n = name.toLowerCase();
  if (n.includes('contract') || n.includes('agreement')) return 'CONTRACT';
  if (n.includes('sow') || n.includes('scope')) return 'SOW';
  if (n.includes('proposal') || n.includes('quote')) return 'PROPOSAL';
  if (n.includes('invoice')) return 'INVOICE';
  return 'OTHER';
};

/** Documents chosen while creating a project; they upload once the project exists. */
export function ProjectFilesPicker({ files, onChange }: { files: PickedFile[]; onChange: (files: PickedFile[]) => void }) {
  const id = useId();
  const [over, setOver] = useState(false);
  const add = (list: FileList | null) => {
    const next = [...files];
    for (const file of Array.from(list ?? [])) {
      const problem = fileProblem(file);
      if (problem) toast.error(`${file.name}: ${problem}`);
      else next.push({ key: crypto.randomUUID(), file, type: guessType(file.name) });
    }
    onChange(next);
  };

  return (
    <div className="space-y-3">
      <label
        htmlFor={id}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          add(e.dataTransfer.files);
        }}
        className={`flex cursor-pointer items-center gap-3 rounded-lg border border-dashed p-3 transition-colors focus-within:ring-2 focus-within:ring-primary ${
          over ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/60 hover:bg-accent'
        }`}
      >
        <span className="grid size-9 shrink-0 place-items-center rounded-md bg-accent text-text-muted">
          <UploadCloud className="size-4" aria-hidden />
        </span>
        <span className="text-sm">
          <span className="font-medium text-primary">Choose files</span> <span className="text-text-muted">or drag them here</span>
          <span className="block text-xs text-text-muted">Proposal, SOW, contract… · PDF, Office, PNG, JPG or ZIP · up to 25 MB each</span>
        </span>
        <input
          id={id}
          type="file"
          multiple
          className="sr-only"
          aria-label="Add documents"
          accept=".pdf,.png,.jpg,.jpeg,.docx,.xlsx,.pptx,.zip"
          onChange={(e) => {
            add(e.target.files);
            e.target.value = '';
          }}
        />
      </label>
      {files.length > 0 && (
        <ul className="space-y-2">
          {files.map((f) => (
            <li key={f.key} className="flex items-center gap-3 rounded-lg border border-border p-2">
              <FileText className="ml-1 size-4 shrink-0 text-text-muted" aria-hidden />
              <span className="min-w-0 flex-1 truncate text-sm">{f.file.name}</span>
              <OptionSelect
                aria-label={`Type of ${f.file.name}`}
                className="h-8 w-32 rounded-md border border-border bg-surface px-2 text-sm"
                value={f.type}
                onValueChange={(v) => onChange(files.map((x) => (x.key === f.key ? { ...x, type: v as DocType } : x)))}
              >
                {DOCUMENT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {TYPE_LABEL[t]}
                  </option>
                ))}
              </OptionSelect>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label={`Remove ${f.file.name}`}
                onClick={() => onChange(files.filter((x) => x.key !== f.key))}
              >
                <X className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
