import { IMPORT_COLUMNS } from '@salescrm/core';
import { type ImportPreview, importPreviewSchema, type ImportResult, importResultSchema } from '@salescrm/schemas';
import { Button, Table, TBody, TD, TH, THead, TR } from '@salescrm/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Download, Upload } from 'lucide-react';
import { useId, useState } from 'react';
import { ApiError, apiFetch } from '../../lib/api';
import { downloadCsv } from '../../lib/download';
import { formatApiMoney } from '../../lib/money';

const TEMPLATE = [
  IMPORT_COLUMNS.join(','),
  'Acme Corp,accounts@acme.example,Website redesign,ACTIVE,"1,50,000",INR,2026-04-10,,,Design,50000,2026-05-01,50000,2026-05-04,INV-101',
  'Acme Corp,,Website redesign,,,,,,,Build,100000,2026-07-01,40000,2026-07-05,INV-102',
  'Bluepeak,,Brand audit,PROPOSAL,60000,,,,,,,,,,',
].join('\n');

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

type Problem = { line: number; message: string };
const problemsOf = (e: unknown): Problem[] | null => {
  const d = e instanceof ApiError ? (e.details as { errors?: Problem[] } | undefined) : undefined;
  return d?.errors?.length ? d.errors : null;
};

/** Settings → Import data (P6-4): choose a CSV, check the preview, then import everything in one go. */
export function ImportPanel() {
  const inputId = useId();
  const qc = useQueryClient();
  const [csv, setCsv] = useState('');
  const [fileName, setFileName] = useState('');
  const preview = useMutation({
    mutationFn: (text: string) => apiFetch('/imports/preview', { method: 'POST', body: { csv: text }, schema: importPreviewSchema }),
  });
  const run = useMutation({
    mutationFn: () => apiFetch('/imports', { method: 'POST', body: { csv }, schema: importResultSchema }),
    onSuccess: () => void qc.invalidateQueries(),
  });

  const choose = async (file: File | undefined) => {
    if (!file) return;
    run.reset();
    const text = await file.text();
    setCsv(text);
    setFileName(file.name);
    preview.mutate(text);
  };

  const p: ImportPreview | undefined = preview.data;
  const problems = (p?.errors.length ? p.errors : null) ?? problemsOf(run.error);
  const done: ImportResult | undefined = run.data;

  return (
    <div className="space-y-5 rounded-xl bg-surface p-5 shadow-card">
      <div className="space-y-1">
        <h2 className="font-bold">Import existing projects</h2>
        <p className="max-w-2xl text-sm text-text-muted">
          One row per milestone. Client and project columns repeat on each row; repeat a milestone title on a new row to add another
          payment. Amounts are in the currency&apos;s normal units (1,50,000 or 150000). Dates as YYYY-MM-DD or DD/MM/YYYY. Existing clients
          are matched by name. Nothing is saved until you press Import, and if any row has a problem, nothing is imported.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" onClick={() => downloadCsv('import-template.csv', TEMPLATE)}>
          <Download className="size-4" /> Download template
        </Button>
        <label
          htmlFor={inputId}
          className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-full bg-primary px-4 text-sm font-semibold text-primary-contrast"
        >
          <Upload className="size-4" /> {fileName || 'Choose CSV file'}
        </label>
        <input
          id={inputId}
          aria-label="CSV file"
          type="file"
          accept=".csv,text/csv"
          className="sr-only"
          onChange={(e) => {
            void choose(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
        {preview.isPending && <span className="text-sm text-text-muted">Checking the file…</span>}
      </div>

      {preview.error && !problemsOf(preview.error) && <p className="text-sm text-danger">{preview.error.message}</p>}
      {problems && (
        <div role="alert" className="rounded-lg border border-danger/30 bg-danger/5 p-4 text-sm">
          <p className="mb-2 font-semibold text-danger">
            {plural(problems.length, 'problem')} found. Fix the file and choose it again; nothing was imported.
          </p>
          <ul className="max-h-60 space-y-1 overflow-y-auto">
            {problems.map((e, i) => (
              <li key={i}>
                Line {e.line}: {e.message}
              </li>
            ))}
          </ul>
        </div>
      )}
      {run.error && !problemsOf(run.error) && <p className="text-sm text-danger">{run.error.message}</p>}

      {done ? (
        <p role="status" className="rounded-lg bg-accent p-4 text-sm font-semibold text-primary">
          Imported {plural(done.projects, 'project')}, {plural(done.newClients, 'new client')}, {plural(done.milestones, 'milestone')} and{' '}
          {plural(done.payments, 'payment')}.
        </p>
      ) : (
        p &&
        p.projects > 0 && (
          <section aria-label="Import preview" className="space-y-3">
            <p className="text-sm">
              <strong>{plural(p.projects, 'project')}</strong> · {plural(p.newClients, 'new client')} ·{' '}
              {plural(p.existingClients, 'existing client')} · {plural(p.milestones, 'milestone')} · {plural(p.payments, 'payment')}
            </p>
            <Table className="text-sm">
              <THead>
                <TR>
                  <TH>Line</TH>
                  <TH>Client</TH>
                  <TH>Project</TH>
                  <TH>Status</TH>
                  <TH className="text-right">Expected</TH>
                  <TH className="text-right">Milestones</TH>
                  <TH className="text-right">Paid</TH>
                </TR>
              </THead>
              <TBody>
                {p.sample.map((s) => (
                  <TR key={s.line}>
                    <TD className="text-text-muted">{s.line}</TD>
                    <TD>
                      {s.client}
                      {!s.clientExists && (
                        <span className="ml-1.5 rounded-full bg-accent px-1.5 text-[10px] font-semibold text-primary">new</span>
                      )}
                    </TD>
                    <TD className="font-medium">{s.name}</TD>
                    <TD>{s.status}</TD>
                    <TD className="text-right tabular-nums">{formatApiMoney(s.expectedAmountMinor, s.currency)}</TD>
                    <TD className="text-right tabular-nums">{s.milestones}</TD>
                    <TD className="text-right tabular-nums">{formatApiMoney(s.paidMinor, s.currency)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            {p.projects > p.sample.length && <p className="text-xs text-text-muted">Showing the first {p.sample.length}.</p>}
            {!problems && (
              <Button disabled={run.isPending} onClick={() => run.mutate()}>
                {run.isPending ? 'Importing…' : `Import ${plural(p.projects, 'project')}`}
              </Button>
            )}
          </section>
        )
      )}
    </div>
  );
}
