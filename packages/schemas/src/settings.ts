import { z } from 'zod';

function isTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export const settingsSchema = z.object({
  companyName: z.string().trim().max(120),
  baseCurrency: z.string().regex(/^[A-Z]{3}$/, 'Use a 3-letter currency code like INR'),
  fyStartMonth: z.number().int().min(1).max(12),
  timezone: z.string().refine(isTimeZone, 'Unknown timezone'),
  dueSoonDays: z.number().int().min(1).max(60),
});
export type Settings = z.infer<typeof settingsSchema>;

export const updateSettingsSchema = settingsSchema.partial();
export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;
