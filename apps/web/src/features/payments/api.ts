import { billingPageSchema, type CreatePaymentInput, paymentDtoSchema, type UpdatePaymentMetaInput } from '@salescrm/schemas';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../../lib/api';

export function usePayments(search: string, enabled = true) {
  return useQuery({
    queryKey: ['payments', search],
    queryFn: () => apiFetch(`/payments${search ? `?${search}` : ''}`, { schema: billingPageSchema }),
    placeholderData: keepPreviousData,
    enabled,
  });
}

/** A payment changes the project totals, milestone status, billing and invoices: refresh all of them. */
function useRefreshAfterPayment() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ['projects'] });
    void qc.invalidateQueries({ queryKey: ['payments'] });
    void qc.invalidateQueries({ queryKey: ['invoices'] });
    void qc.invalidateQueries({ queryKey: ['dashboard'] });
  };
}

export function useMarkPaid(milestoneId: string) {
  const refresh = useRefreshAfterPayment();
  return useMutation({
    mutationFn: ({ input, key }: { input: CreatePaymentInput; key: string }) =>
      apiFetch(`/milestones/${milestoneId}/payments`, {
        method: 'POST',
        body: input,
        schema: paymentDtoSchema,
        headers: { 'Idempotency-Key': key },
      }),
    onSuccess: refresh,
  });
}

export function useEditPayment(id: string) {
  const refresh = useRefreshAfterPayment();
  return useMutation({
    mutationFn: (input: UpdatePaymentMetaInput) => apiFetch(`/payments/${id}`, { method: 'PATCH', body: input, schema: paymentDtoSchema }),
    onSuccess: refresh,
  });
}

export function useReversePayment(id: string) {
  const refresh = useRefreshAfterPayment();
  return useMutation({
    mutationFn: (reason: string) => apiFetch(`/payments/${id}/reverse`, { method: 'POST', body: { reason }, schema: paymentDtoSchema }),
    onSuccess: refresh,
  });
}
