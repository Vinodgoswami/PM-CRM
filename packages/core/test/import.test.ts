import { expect, test } from 'vitest';
import { IMPORT_COLUMNS, parseCsv, parseImport } from '../src/import';

const OPTS = { today: '2026-10-30', baseCurrency: 'INR' };
const HEADER = IMPORT_COLUMNS.join(',');
const cell = (s: string) => (/[",]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s);
const row = (v: Partial<Record<(typeof IMPORT_COLUMNS)[number], string>>) => IMPORT_COLUMNS.map((c) => cell(v[c] ?? '')).join(',');
const csv = (...rows: string[]) => [HEADER, ...rows].join('\r\n');

test('parseCsv handles quotes, embedded commas and quotes, CRLF and a BOM', () => {
  expect(parseCsv(String.fromCharCode(0xfeff) + 'a,b\r\n"x, y","say ""hi"""\n\nlast,')).toEqual([
    ['a', 'b'],
    ['x, y', 'say "hi"'],
    ['last', ''],
  ]);
});

test('rows group into projects, milestones and payments with exact money and both date formats', () => {
  const plan = parseImport(
    csv(
      row({
        client: 'Acme',
        client_email: 'ap@acme.test',
        project: 'Website',
        status: 'ACTIVE',
        expected_amount: '1,25,000',
        confirmed_date: '2026-05-01',
        owner_email: 'rohan@x.test',
        milestone: 'Design',
        milestone_amount: '50,000',
        due_date: '01/06/2026',
        paid_amount: '20000.50',
        paid_date: '2026-06-05',
        invoice_id: 'INV-1',
      }),
      row({ client: 'acme', project: 'website', milestone: 'Design', paid_amount: '10000', paid_date: '2026-06-20', invoice_id: 'INV-2' }),
      row({ client: 'Acme', project: 'Website', milestone: 'Build', milestone_amount: '75000', due_date: '2026-09-01' }),
      row({ client: 'Bluepeak', project: 'Audit', status: 'LEAD', expected_amount: '30000' }),
    ),
    OPTS,
  );
  expect(plan.errors).toEqual([]);
  expect(plan.projects).toHaveLength(2);
  const [web, audit] = plan.projects;
  expect(web).toMatchObject({
    line: 2,
    client: { name: 'Acme', email: 'ap@acme.test' },
    name: 'Website',
    status: 'ACTIVE',
    currency: 'INR',
    expectedAmountMinor: 12500000n,
    wonAt: '2026-05-01',
    closedAt: null,
    ownerEmail: 'rohan@x.test',
  });
  expect(web!.milestones).toEqual([
    {
      title: 'Design',
      amountMinor: 5000000n,
      dueDate: '2026-06-01',
      payments: [
        { amountMinor: 2000050n, paymentDate: '2026-06-05', invoiceId: 'INV-1', fxRate: null },
        { amountMinor: 1000000n, paymentDate: '2026-06-20', invoiceId: 'INV-2', fxRate: null },
      ],
    },
    { title: 'Build', amountMinor: 7500000n, dueDate: '2026-09-01', payments: [] },
  ]);
  expect(audit).toMatchObject({ status: 'LEAD', wonAt: null, milestones: [] });
});

test('each broken row is reported with its line number and rule', () => {
  const plan = parseImport(
    csv(
      row({ project: 'No client', expected_amount: '100' }),
      row({ client: 'A', project: 'Bad money', expected_amount: '1,00,0' }),
      row({
        client: 'B',
        project: 'Over',
        status: 'WON',
        expected_amount: '100',
        confirmed_date: '2026-01-01',
        milestone: 'M',
        milestone_amount: '100',
        paid_amount: '150',
        paid_date: '2026-02-01',
      }),
      row({
        client: 'C',
        project: 'Future',
        status: 'WON',
        expected_amount: '100',
        confirmed_date: '2026-01-01',
        milestone: 'M',
        milestone_amount: '100',
        paid_amount: '50',
        paid_date: '2026-12-01',
      }),
      row({
        client: 'D',
        project: 'Lead pay',
        status: 'LEAD',
        expected_amount: '100',
        milestone: 'M',
        milestone_amount: '100',
        paid_amount: '50',
        paid_date: '2026-02-01',
      }),
      row({
        client: 'E',
        project: 'Undated',
        status: 'ACTIVE',
        expected_amount: '100',
        confirmed_date: '2026-01-01',
        milestone: 'M',
        milestone_amount: '100',
      }),
      row({ client: 'F', project: 'No won date', status: 'WON', expected_amount: '100' }),
      row({ client: 'G', project: 'Odd', status: 'MAYBE', expected_amount: '100' }),
      row({
        client: 'H',
        project: 'Lost paid',
        status: 'LOST',
        expected_amount: '100',
        confirmed_date: '2026-01-01',
        closed_date: '2026-03-01',
        milestone: 'M',
        milestone_amount: '100',
        paid_amount: '50',
        paid_date: '2026-02-01',
      }),
    ),
    OPTS,
  );
  expect(plan.errors).toEqual([
    { line: 2, message: 'Client is required.' },
    { line: 3, message: 'expected_amount: "1,00,0" is not a valid amount (expected a positive number like 1,25,000.50).' },
    { line: 4, message: 'P-2: payments on milestone "M" add up to more than its amount.' },
    { line: 5, message: 'P-6: paid_date 2026-12-01 is in the future.' },
    { line: 6, message: 'P-8: payments can only be recorded on Confirmed, Active, On hold or Completed projects.' },
    { line: 7, message: 'PS-4: an Active project needs at least one milestone, and every milestone needs a due date.' },
    { line: 8, message: 'confirmed_date is required for status Confirmed.' },
    { line: 9, message: 'status "MAYBE" is not one of Enquiry, Quoted, Confirmed, Active, On hold, Completed, Cancelled.' },
    { line: 10, message: 'PS-6: a Cancelled project cannot have payments.' },
  ]);
});

test('later rows may not contradict a project’s first row', () => {
  const plan = parseImport(
    csv(
      row({ client: 'A', project: 'P', status: 'LEAD', expected_amount: '100' }),
      row({ client: 'A', project: 'P', expected_amount: '200', milestone: 'M', milestone_amount: '50' }),
    ),
    OPTS,
  );
  expect(plan.errors).toEqual([{ line: 3, message: 'expected_amount differs from line 2 for the same project.' }]);
});

test('a missing required column is reported on line 1', () => {
  expect(parseImport('client,project\r\nA,B', OPTS).errors).toEqual([{ line: 1, message: 'Missing column: expected_amount.' }]);
});

test('an unknown currency code is an error, not a crash', () => {
  const plan = parseImport(csv(row({ client: 'A', project: 'P', status: 'LEAD', expected_amount: '100', currency: 'XYZ1' })), OPTS);
  expect(plan.errors).toEqual([{ line: 2, message: 'currency "XYZ1" is not a three-letter currency code.' }]);
});

test('stages may be written as on screen (Enquiry, Quoted, Confirmed, On hold, Cancelled) or as codes', () => {
  const plan = parseImport(
    [
      'client,project,status,expected_amount,won_date,confirmed_date,closed_date',
      'A,P1,Enquiry,100,,,',
      'A,P2,quoted,100,,,',
      'A,P3,Confirmed,100,,2026-05-01,',
      'A,P4,On hold,100,2026-05-01,,',
      'A,P5,Cancelled,100,,,2026-06-01',
      'A,P6,WON,100,2026-05-01,,',
    ].join('\n'),
    OPTS,
  );
  expect(plan.errors).toEqual([]);
  expect(plan.projects.map((p) => [p.status, p.wonAt])).toEqual([
    ['LEAD', null],
    ['PROPOSAL', null],
    ['WON', '2026-05-01'],
    ['ON_HOLD', '2026-05-01'],
    ['LOST', null],
    ['WON', '2026-05-01'],
  ]);
});

test('D-020 an optional fx_rate column gives a payment its rate; a bad rate is reported', () => {
  const plan = parseImport(
    csv(
      row({
        client: 'A',
        project: 'P',
        status: 'WON',
        expected_amount: '100',
        confirmed_date: '2026-01-01',
        milestone: 'M',
        milestone_amount: '100',
        paid_amount: '40',
        paid_date: '2026-02-01',
        fx_rate: '0.0119',
      }),
      row({ client: 'A', project: 'P', milestone: 'M', paid_amount: '10', paid_date: '2026-03-01' }),
      row({
        client: 'B',
        project: 'Q',
        status: 'WON',
        expected_amount: '100',
        confirmed_date: '2026-01-01',
        milestone: 'M',
        milestone_amount: '100',
        paid_amount: '40',
        paid_date: '2026-02-01',
        fx_rate: 'abc',
      }),
    ),
    OPTS,
  );
  expect(plan.projects[0]!.milestones[0]!.payments.map((p) => p.fxRate)).toEqual(['0.0119', null]);
  expect(plan.errors).toEqual([
    { line: 4, message: 'fx_rate: "abc" is not a valid rate (expected a positive rate like 0.0119 or 84.15).' },
  ]);
});
