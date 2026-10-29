import {
  type CreateProjectInput,
  type MilestoneInput,
  documentDtoSchema,
  projectDetailSchema,
  projectListItemSchema,
  type ProjectStatusValue,
  type RequestUploadInput,
  type UpdateMilestoneInput,
  type UpdateProjectInput,
  type UpsellEntryInput,
  uploadSlotSchema,
} from '@salescrm/schemas';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { ApiError, apiFetch } from '../../lib/api';

export const projectKeys = {
  all: ['projects'] as const,
  list: (search: string) => ['projects', 'list', search] as const,
  detail: (id: string) => ['projects', 'detail', id] as const,
  documents: (id: string) => ['projects', 'documents', id] as const,
  activity: (id: string) => ['projects', 'activity', id] as const,
};

const listSchema = z.object({ items: z.array(projectListItemSchema), page: z.number(), pageSize: z.number(), total: z.number() });

export function useProjects(search: string, enabled = true) {
  return useQuery({
    queryKey: projectKeys.list(search),
    queryFn: () => apiFetch(`/projects${search ? `?${search}` : ''}`, { schema: listSchema }),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useProject(id: string) {
  return useQuery({ queryKey: projectKeys.detail(id), queryFn: () => apiFetch(`/projects/${id}`, { schema: projectDetailSchema }) });
}

/** Every project mutation returns the fresh detail: cache it and refresh lists. */
function useProjectMutation<TInput>(id: string, request: (input: TInput) => Promise<z.infer<typeof projectDetailSchema>>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: request,
    onSuccess: (project) => {
      qc.setQueryData(projectKeys.detail(id), project);
      void qc.invalidateQueries({ queryKey: ['projects', 'list'] });
      void qc.invalidateQueries({ queryKey: projectKeys.activity(id) });
    },
  });
}

export const useChangeStatus = (id: string) =>
  useProjectMutation(id, (status: ProjectStatusValue) =>
    apiFetch(`/projects/${id}/status`, { method: 'POST', body: { status }, schema: projectDetailSchema }),
  );

export const useAddUpsell = (id: string) =>
  useProjectMutation(id, (input: UpsellEntryInput) =>
    apiFetch(`/projects/${id}/upsells`, { method: 'POST', body: input, schema: projectDetailSchema }),
  );

export const useSetParent = (id: string) =>
  useProjectMutation(id, (parentProjectId: string | null) =>
    apiFetch(`/projects/${id}/parent`, { method: 'PUT', body: { parentProjectId }, schema: projectDetailSchema }),
  );

export const useUpdateProject = (id: string) =>
  useProjectMutation(id, (input: UpdateProjectInput) =>
    apiFetch(`/projects/${id}`, { method: 'PATCH', body: input, schema: projectDetailSchema }),
  );

export function useRemoveUpsell(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (entryId: string) => apiFetch(`/projects/${id}/upsells/${entryId}`, { method: 'DELETE', schema: z.undefined() }),
    onSuccess: () => qc.invalidateQueries({ queryKey: projectKeys.all }),
  });
}

export function useCreateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateProjectInput) => apiFetch('/projects', { method: 'POST', body: input, schema: projectDetailSchema }),
    onSuccess: (project) => {
      qc.setQueryData(projectKeys.detail(project.id), project);
      void qc.invalidateQueries({ queryKey: ['projects', 'list'] });
      void qc.invalidateQueries({ queryKey: ['clients'] });
    },
  });
}

export function useDocuments(id: string) {
  return useQuery({
    queryKey: projectKeys.documents(id),
    queryFn: () => apiFetch(`/projects/${id}/documents`, { schema: z.object({ items: z.array(documentDtoSchema) }) }),
  });
}

/** docs/04 § Documents: request a signed slot, upload the bytes directly, then confirm. */
export function useUploadDocument(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ file, type }: { file: File; type: RequestUploadInput['type'] }) => {
      const slot = await apiFetch(`/projects/${id}/documents/upload-url`, {
        method: 'POST',
        body: { name: file.name, type, mimeType: file.type, sizeBytes: file.size },
        schema: uploadSlotSchema,
      });
      const put = await fetch(slot.url, { method: 'PUT', headers: slot.headers, body: file });
      if (!put.ok) throw new ApiError(put.status, 'UPLOAD_FAILED', 'The upload failed. Please try again.');
      return apiFetch(`/documents/${slot.documentId}/confirm`, { method: 'POST', schema: documentDtoSchema });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: projectKeys.documents(id) });
      void qc.invalidateQueries({ queryKey: projectKeys.activity(id) });
    },
  });
}

export function useDeleteDocument(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (documentId: string) => apiFetch(`/documents/${documentId}`, { method: 'DELETE', schema: z.undefined() }),
    onSuccess: () => qc.invalidateQueries({ queryKey: projectKeys.documents(projectId) }),
  });
}

export async function documentDownloadUrl(documentId: string): Promise<string> {
  return (await apiFetch(`/documents/${documentId}/download`, { schema: z.object({ url: z.string() }) })).url;
}

const activitySchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      action: z.string(),
      at: z.string(),
      actor: z.object({ id: z.string(), name: z.string() }),
      before: z.unknown(),
      after: z.unknown(),
    }),
  ),
});

export function useProjectActivity(id: string) {
  return useQuery({ queryKey: projectKeys.activity(id), queryFn: () => apiFetch(`/projects/${id}/activity`, { schema: activitySchema }) });
}

export const useAddMilestone = (id: string) =>
  useProjectMutation(id, (input: MilestoneInput) =>
    apiFetch(`/projects/${id}/milestones`, { method: 'POST', body: input, schema: projectDetailSchema }),
  );
export const useUpdateMilestone = (id: string) =>
  useProjectMutation(id, ({ milestoneId, ...input }: UpdateMilestoneInput & { milestoneId: string }) =>
    apiFetch(`/milestones/${milestoneId}`, { method: 'PATCH', body: input, schema: projectDetailSchema }),
  );
export const useDeleteMilestone = (id: string) =>
  useProjectMutation(id, (milestoneId: string) =>
    apiFetch(`/milestones/${milestoneId}`, { method: 'DELETE', schema: projectDetailSchema }),
  );
export const useReorderMilestones = (id: string) =>
  useProjectMutation(id, (ids: string[]) =>
    apiFetch(`/projects/${id}/milestones/order`, { method: 'PUT', body: { ids }, schema: projectDetailSchema }),
  );
