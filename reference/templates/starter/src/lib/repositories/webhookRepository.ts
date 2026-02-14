import type { Webhook, WebhookEventType } from '@/lib/types';
import { api } from '@/lib/apiClient';

interface WebhookListResponse {
  data: Webhook[];
}

interface WebhookResponse {
  data: Webhook;
}

export const listWebhooks = async ({
  ownerId,
  newsfeedId,
}: {
  ownerId: string;
  newsfeedId?: string;
}): Promise<Webhook[]> => {
  console.log(`Listing webhooks for ${ownerId}`);
  const queryParams = newsfeedId ? `?newsfeedId=${newsfeedId}` : '';
  const response = await api.get<WebhookListResponse>(`/api/v1/webhooks${queryParams}`);
  return response.data;
};

export const createWebhook = async ({
  ownerId,
  newsfeedId,
  url,
  events,
  headers,
  retryLimit,
}: {
  ownerId: string;
  newsfeedId?: string;
  url: string;
  events: WebhookEventType[];
  headers?: Record<string, string>;
  retryLimit?: number;
}): Promise<Webhook> => {
  const response = await api.post<WebhookResponse>('/api/v1/webhooks', {
    ownerId,
    newsfeedId: newsfeedId ?? null,
    url,
    events,
    headers: headers ?? {},
    retryLimit: retryLimit ?? 3,
    active: true,
  });
  return response.data;
};

export const updateWebhook = async (
  _ownerId: string,
  id: string,
  updates: Partial<{
    url: string;
    events: WebhookEventType[];
    headers: Record<string, string>;
    retryLimit: number;
    active: boolean;
  }>,
): Promise<Webhook | null> => {
  try {
    const response = await api.patch<WebhookResponse>(`/api/v1/webhooks/${id}`, updates);
    return response.data;
  } catch {
    return null;
  }
};

export const deleteWebhook = async (_ownerId: string, id: string) => {
  try {
    await api.delete(`/api/v1/webhooks/${id}`);
  } catch (error) {
    console.error('Failed to delete webhook:', error);
  }
};

export const getWebhook = async (
  _ownerId: string,
  id: string,
): Promise<Webhook | null> => {
  try {
    const response = await api.get<WebhookResponse>(`/api/v1/webhooks/${id}`);
    return response.data;
  } catch {
    return null;
  }
};
