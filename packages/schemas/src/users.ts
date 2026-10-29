import { z } from 'zod';
import { emailSchema, passwordSchema, roleSchema } from './auth';

export const inviteUserSchema = z.object({
  email: emailSchema,
  name: z.string().trim().min(1, 'Enter a name').max(100),
  role: roleSchema,
});
export type InviteUserInput = z.infer<typeof inviteUserSchema>;

export const updateUserSchema = z
  .object({ role: roleSchema.optional(), active: z.boolean().optional() })
  .refine((v) => v.role !== undefined || v.active !== undefined, 'Change the role or the active flag');
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

export const acceptInviteSchema = z.object({
  token: z.string().min(1).max(200),
  name: z.string().trim().min(1, 'Enter your name').max(100),
  password: passwordSchema,
});
export type AcceptInviteInput = z.infer<typeof acceptInviteSchema>;

export const resetPasswordSchema = z.object({
  token: z.string().min(1).max(200),
  password: passwordSchema,
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const userListItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  role: roleSchema,
  active: z.boolean(),
  lastLoginAt: z.string().nullable(),
});
export type UserListItem = z.infer<typeof userListItemSchema>;

export const linkResponseSchema = z.object({ url: z.string(), expiresAt: z.string() });
export type LinkResponse = z.infer<typeof linkResponseSchema>;
