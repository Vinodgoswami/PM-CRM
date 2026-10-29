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
});
export type SessionUserDto = z.infer<typeof sessionUserSchema>;

export const sessionResponseSchema = z.object({
  user: sessionUserSchema,
  csrfToken: z.string(),
});
export type SessionResponse = z.infer<typeof sessionResponseSchema>;
