import { z } from 'zod';
import { emailSchema } from './auth';

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === '' ? undefined : v))
    .optional();

export const clientNameSchema = z.string().trim().min(1, 'Enter the client name').max(120);

export const contactSchema = z.object({
  name: optionalText(120),
  email: emailSchema,
  phone: optionalText(40),
  isPrimary: z.boolean().optional(),
});
export type ContactInput = z.infer<typeof contactSchema>;

export const createClientSchema = z.object({
  name: clientNameSchema,
  company: optionalText(160),
  country: z
    .string()
    .regex(/^[A-Z]{2}$/, 'Use a 2-letter country code')
    .optional(),
  currency: z
    .string()
    .regex(/^[A-Z]{3}$/, 'Use a 3-letter currency code')
    .optional(),
  notes: optionalText(2000),
  contact: contactSchema.omit({ isPrimary: true }).optional(),
});
export type CreateClientInput = z.infer<typeof createClientSchema>;

export const updateClientSchema = createClientSchema.omit({ contact: true }).partial();
export type UpdateClientInput = z.infer<typeof updateClientSchema>;

export const updateContactSchema = contactSchema.partial();
export type UpdateContactInput = z.infer<typeof updateContactSchema>;

export const clientListQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  includeArchived: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export type ClientListQuery = z.infer<typeof clientListQuerySchema>;

export const clientListItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  company: z.string().nullable(),
  primaryEmail: z.string().nullable(),
  projects: z.number(),
  archived: z.boolean(),
});
export type ClientListItem = z.infer<typeof clientListItemSchema>;

export const contactDtoSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  email: z.string(),
  phone: z.string().nullable(),
  isPrimary: z.boolean(),
});
export type ContactDto = z.infer<typeof contactDtoSchema>;

export const clientDetailSchema = clientListItemSchema.extend({
  country: z.string().nullable(),
  currency: z.string(),
  notes: z.string().nullable(),
  contacts: z.array(contactDtoSchema),
  projects: z.array(
    z.object({ id: z.string(), code: z.string(), name: z.string(), status: z.string(), parentProjectId: z.string().nullable() }),
  ),
  bookedMinor: z.number(),
  collectedMinor: z.number(),
  outstandingMinor: z.number(),
});
export type ClientDetail = z.infer<typeof clientDetailSchema>;
