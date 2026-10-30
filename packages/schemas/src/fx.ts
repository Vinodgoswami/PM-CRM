import { z } from 'zod';
import { isoDateSchema } from './projects';

const currency = z.string().regex(/^[A-Z]{3}$/, 'Use a 3-letter currency code');
/** Exchange rate as a decimal string: units of the base currency per 1 unit of the other (D-020). */
export const fxRateValueSchema = z
  .string()
  .trim()
  .regex(/^\d+(?:\.\d{1,10})?$/, 'Enter a rate like 0.0119 or 84.15')
  .refine((v) => /[1-9]/.test(v), 'The rate must be above zero');

export const fxRateQuerySchema = z.object({ from: currency, to: currency, date: isoDateSchema.optional() });
export const fxRateSchema = z.object({ from: z.string(), to: z.string(), rate: z.string(), date: isoDateSchema, source: z.string() });
export type FxRateDto = z.infer<typeof fxRateSchema>;
