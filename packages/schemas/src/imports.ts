import { z } from 'zod';
import { minorSchema } from './projects';

/** CSV import of existing work (P6-4). The CSV travels as text; 5 MB is far above a few thousand rows. */
export const importRequestSchema = z.object({ csv: z.string().min(1, 'Choose a CSV file').max(5_000_000, 'The file is larger than 5 MB') });
export type ImportRequest = z.infer<typeof importRequestSchema>;

const importErrorSchema = z.object({ line: z.number(), message: z.string() });

export const importPreviewSchema = z.object({
  projects: z.number(),
  newClients: z.number(),
  existingClients: z.number(),
  milestones: z.number(),
  payments: z.number(),
  errors: z.array(importErrorSchema),
  /** The first 100 projects as they will be created. */
  sample: z.array(
    z.object({
      line: z.number(),
      client: z.string(),
      clientExists: z.boolean(),
      name: z.string(),
      status: z.string(),
      currency: z.string(),
      expectedAmountMinor: minorSchema,
      milestones: z.number(),
      paidMinor: minorSchema,
    }),
  ),
});
export type ImportPreview = z.infer<typeof importPreviewSchema>;

export const importResultSchema = z.object({
  projects: z.number(),
  newClients: z.number(),
  milestones: z.number(),
  payments: z.number(),
});
export type ImportResult = z.infer<typeof importResultSchema>;
