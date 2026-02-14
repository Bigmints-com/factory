"use server";

import bcrypt from 'bcryptjs';
import { z } from 'zod';
import {
  createPasswordUser,
  getUserByEmail,
} from '@/lib/repositories/userRepository';
// OTP service removed - using email link auth instead

const registerSchema = z.object({
  name: z
    .string()
    .min(2, 'Name must be at least 2 characters')
    .max(100, 'Name cannot exceed 100 characters')
    .optional()
    .or(z.literal('')),
  email: z.string().email('Please provide a valid email'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(
      /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]{8,}$/,
      'Password must include letters and numbers',
    ),
});

export const registerUser = async (formData: FormData) => {
  const raw = {
    name: formData.get('name')?.toString() ?? '',
    email: formData.get('email')?.toString() ?? '',
    password: formData.get('password')?.toString() ?? '',
  };

  const parsed = registerSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      errors: parsed.error.flatten().fieldErrors,
    };
  }

  const { email, password, name } = parsed.data;
  const existing = await getUserByEmail(email);
  if (existing) {
    return {
      success: false,
      errors: {
        email: ['An account with this email already exists.'],
      },
    };
  }

  // For email link auth, password is optional (generated if not provided)
  const passwordHash = password 
    ? await bcrypt.hash(password, 12)
    : await bcrypt.hash(Math.random().toString(36) + Date.now().toString(), 12); // Generate random password if not provided

  await createPasswordUser({
    email,
    name: name || undefined,
    passwordHash,
  });

  return {
    success: true,
  };
};
