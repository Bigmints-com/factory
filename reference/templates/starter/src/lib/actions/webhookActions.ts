"use server";


import {
  createWebhook,
  deleteWebhook,
  updateWebhook,
} from '@/lib/repositories/webhookRepository';
import { WebhookEventType } from '@/lib/types';
import { z } from 'zod';
import { getUser } from '@saveaday/shared-auth/server';
import { revalidatePath } from 'next/cache';

const webhookSchema = z.object({
  url: z.string().url('Provide a valid HTTPS endpoint'),
  newsfeedId: z.string().optional().or(z.literal('')),
  events: z
    .array(z.enum(['submission.created', 'submission.updated', 'submission.deleted']))
    .min(1, 'Select at least one event'),
  headers: z.record(z.string()).optional(),
  retryLimit: z
    .number({ invalid_type_error: 'Retry limit must be a number' })
    .min(1)
    .max(10)
    .default(3),
});

const getSessionUser = async () => {
  const user = await getUser();
  if (!user?.uid) {
    throw new Error('Unauthorized');
  }
  return user;
};

export const createWebhookAction = async (formData: FormData) => {
  const user = await getSessionUser();
  const events = formData.getAll('events').map((event) => event.toString());
  const headersRaw = formData.get('headers')?.toString() ?? '';
  const headers = headersRaw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .reduce<Record<string, string>>((acc, line) => {
      const [key, ...rest] = line.split(':');
      if (!key || !rest.length) return acc;
      acc[key.trim()] = rest.join(':').trim();
      return acc;
    }, {});

  const parsed = webhookSchema.safeParse({
    url: formData.get('url'),
    newsfeedId: formData.get('newsfeedId') ?? '',
    events: events as WebhookEventType[],
    headers,
    retryLimit: Number(formData.get('retryLimit') ?? 3),
  });

  if (!parsed.success) {
    return {
      success: false,
      errors: parsed.error.flatten().fieldErrors,
    };
  }

  await createWebhook({
    ownerId: user.id,
    newsfeedId: parsed.data.newsfeedId || undefined,
    url: parsed.data.url,
    events: parsed.data.events,
    headers: parsed.data.headers,
    retryLimit: parsed.data.retryLimit,
  });

  revalidatePath('/integrations/webhooks');
  return { success: true };
};

export const toggleWebhookAction = async (webhookId: string, active: boolean) => {
  const user = await getSessionUser();
  await updateWebhook(user.id, webhookId, { active });
  revalidatePath('/integrations/webhooks');
};

export const deleteWebhookAction = async (webhookId: string) => {
  const user = await getSessionUser();
  await deleteWebhook(user.id, webhookId);
  revalidatePath('/integrations/webhooks');
};

// Server actions that accept webhookId and active as form data
export const toggleWebhookActionWithId = async (formData: FormData) => {
  const webhookId = formData.get('webhookId')?.toString();
  const active = formData.get('active') === 'true';
  if (!webhookId) {
    throw new Error('Webhook ID is required');
  }
  await toggleWebhookAction(webhookId, active);
};

export const deleteWebhookActionWithId = async (formData: FormData) => {
  const webhookId = formData.get('webhookId')?.toString();
  if (!webhookId) {
    throw new Error('Webhook ID is required');
  }
  await deleteWebhookAction(webhookId);
};
