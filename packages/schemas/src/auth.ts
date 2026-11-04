import { ROLES } from '@salescrm/types';
import { z } from 'zod';

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email({ message: 'Enter a valid email address' }));

export const passwordSchema = z.string().min(10, 'Use at least 10 characters').max(128, 'Use at most 128 characters');

export const roleSchema = z.enum(ROLES);
export type Role = z.infer<typeof roleSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Enter your password').max(128),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const sessionUserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  role: roleSchema,
  /** Address of the profile photo (changes when the photo does); null shows initials. */
  avatarUrl: z.string().nullable().default(null),
  /** D-036: currency this person views the dashboard in; null = the company base currency. */
  displayCurrency: z.string().nullable().default(null),
});

export const preferencesSchema = z.object({
  displayCurrency: z
    .string()
    .regex(/^[A-Z]{3}$/, 'Use a 3-letter currency code')
    .nullable(),
});
export type PreferencesInput = z.infer<typeof preferencesSchema>;
export type SessionUserDto = z.infer<typeof sessionUserSchema>;

export const sessionResponseSchema = z.object({
  user: sessionUserSchema,
  csrfToken: z.string(),
});
export type SessionResponse = z.infer<typeof sessionResponseSchema>;

/** Signed-in user changes their own password (profile). */
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Enter your current password').max(128),
  newPassword: passwordSchema,
});
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

/** D-034: "Forgot password?" — the answer is the same whether or not the address has an account. */
export const forgotPasswordSchema = z.object({ email: emailSchema });
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
