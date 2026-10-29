import { type Dashboard } from '@salescrm/schemas';

export const dashboard = (over: Partial<Dashboard> = {}): Dashboard => ({
  currency: 'INR',
  otherCurrencyProjects: 0,
  period: { key: 'THIS_FY', from: '2026-04-01', to: '2027-03-31' },
  kpis: {
    bookedMinor: 2500000000,
    upsellMinor: 250000000,
    collectedMinor: 1200000000,
    expectedMinor: 1600000000,
    collectionRate: 0.75,
    outstandingMinor: 650000000,
    overdueMinor: 400000000,
    overdueCount: 7,
    dueNext30Minor: 150000000,
    pipelineMinor: 800000000,
    wonCount: 12,
    avgDealMinor: 187500000,
  },
  previous: { bookedMinor: 2000000000, collectedMinor: 1000000000 },
  monthly: Array.from({ length: 12 }, (_, i) => ({
    month: `2026-${String(i + 1).padStart(2, '0')}`,
    bookedMinor: (i + 1) * 10000000,
    collectedMinor: (i + 1) * 8000000,
    expectedMinor: (i + 1) * 9000000,
  })),
  forecast: Array.from({ length: 6 }, (_, i) => ({ month: `2026-${String(i + 5).padStart(2, '0')}`, scheduledMinor: (i + 1) * 5000000 })),
  aging: { d1_30: 100000000, d31_60: 50000000, d61_90: 0, d90plus: 250000000 },
  topClients: [{ id: 'c1', name: 'Acme', bookedMinor: 500000000, collectedMinor: 300000000 }],
  team: [
    {
      user: { id: 'u2', name: 'Rohan Sales' },
      bookedMinor: 1500000000,
      collectedMinor: 700000000,
      outstandingMinor: 300000000,
      overdueMinor: 200000000,
      upsellMinor: 100000000,
      activeProjects: 6,
    },
  ],
  upcoming: [
    {
      milestoneId: 'm1',
      number: 2,
      title: 'Core build',
      balanceMinor: 47600000,
      dueDate: '2026-11-05',
      project: { id: 'p1', code: 'PRJ-0015', name: 'Data Dashboard' },
      client: { id: 'c1', name: 'Acme' },
    },
  ],
  recentPayments: [
    {
      id: 'pay1',
      amountMinor: 47600000,
      paymentDate: '2026-10-29',
      invoiceId: 'INV-2042',
      project: { id: 'p1', code: 'PRJ-0015', name: 'Data Dashboard' },
      client: { id: 'c1', name: 'Acme' },
    },
  ],
  ...over,
});
