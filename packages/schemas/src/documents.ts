import { z } from 'zod';

export const DOCUMENT_TYPES = ['PROPOSAL', 'SOW', 'CONTRACT', 'INVOICE', 'OTHER'] as const;
export const documentTypeSchema = z.enum(DOCUMENT_TYPES);

/** docs/11 § Files: allow-list of upload types. */
export const ALLOWED_DOCUMENT_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'image/png',
  'image/jpeg',
  'application/zip',
] as const;
export const MAX_DOCUMENT_BYTES = 25 * 1024 * 1024;

export const requestUploadSchema = z.object({
  name: z.string().trim().min(1).max(200),
  type: documentTypeSchema,
  mimeType: z.enum(ALLOWED_DOCUMENT_MIME_TYPES, { message: 'This file type is not allowed. Use PDF, Office, PNG, JPG or ZIP.' }),
  sizeBytes: z.number().int().min(1).max(MAX_DOCUMENT_BYTES, 'Files can be at most 25 MB'),
});
export type RequestUploadInput = z.infer<typeof requestUploadSchema>;

export const uploadSlotSchema = z.object({ documentId: z.string(), url: z.string(), headers: z.record(z.string(), z.string()) });
export type UploadSlot = z.infer<typeof uploadSlotSchema>;

export const documentDtoSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: documentTypeSchema,
  mimeType: z.string(),
  sizeBytes: z.number(),
  uploadedBy: z.object({ id: z.string(), name: z.string() }),
  createdAt: z.string(),
});
export type DocumentDto = z.infer<typeof documentDtoSchema>;
