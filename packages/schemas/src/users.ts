import { z } from 'zod';
import { emailSchema, passwordSchema, roleSchema } from './auth';

export const inviteUserSchema = z.object({
  email: emailSchema,
  name: z.string().trim().min(1, 'Enter a name').max(100),
  role: roleSchema,
  /** D-024: for a project manager, the CEO they report to (Admin only; a CEO's invites join their own team). */
  managerId: z.string().optional(),
});
export type InviteUserInput = z.infer<typeof inviteUserSchema>;

export const updateUserSchema = z
  .object({ role: roleSchema.optional(), active: z.boolean().optional(), managerId: z.string().nullable().optional() })
  .refine(
    (v) => v.role !== undefined || v.active !== undefined || v.managerId !== undefined,
    'Change the role, the active flag or the team',
  );
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
  /** D-024: the CEO a project manager reports to. */
  manager: z.object({ id: z.string(), name: z.string() }).nullable().default(null),
});
export type UserListItem = z.infer<typeof userListItemSchema>;

/** `emailed`: the link was also emailed to the person; when false, share `url` by hand. */
export const linkResponseSchema = z.object({ url: z.string(), expiresAt: z.string(), emailed: z.boolean().default(false) });
export type LinkResponse = z.infer<typeof linkResponseSchema>;

/** Profile photo (any signed-in user, for themselves): small JPEG, PNG or WebP. */
export const AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
export const avatarUploadSchema = z.object({
  mimeType: z.enum(AVATAR_TYPES, { message: 'Use a JPEG, PNG or WebP image' }),
  sizeBytes: z.number().int().min(1).max(AVATAR_MAX_BYTES, 'Use an image up to 2 MB'),
});
export const setAvatarSchema = z.object({ key: z.string().min(1).max(200) });
