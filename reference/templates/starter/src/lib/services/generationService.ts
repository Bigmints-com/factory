import { createEdition, updateEditionStatus } from '@/lib/repositories/editionRepository';
import { ContentGenerator } from '@saveaday/content-generator';
import { getLLMConfiguration, getActiveLLMConfiguration } from '@saveaday/llm-config/server';
import type { EditionOutput } from '@/lib/types';
import { CrudHandlerConfig } from '@saveaday/shared-api/types';
import { revalidatePath } from 'next/cache';

// Import integrations system
import '@/lib/integrations'; // Register triggers
import { getTriggersForEvent } from '@saveaday/integrations/server';
import { getNewsfeedById } from '@/lib/repositories/newsfeedRepository';

export async function generateEditionInternal(
    ownerId: string,
    newsfeedId: string,
    inputs: { urls: string[], text: string, images: { mimeType: string, data: string }[], configId?: string }
) {
    console.log(`[generateEditionInternal] Starting for newsfeedId: ${newsfeedId}, ownerId: ${ownerId}`);

    // 1. Create Edition Record (Generating)
    const edition = await createEdition(newsfeedId, {
        marketing_title: `Edition ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`,
        inputs: {
            text: inputs.text,
            urls: inputs.urls,
            imageUrls: [] // We don't store raw base64
        }
    });

    try {
        // 2. Resolve LLM Config
        let configRes;
        if (inputs.configId) {
            configRes = await getLLMConfiguration(ownerId, inputs.configId);
        } else {
            // For cron jobs, we use the active configuration
            configRes = await getActiveLLMConfiguration(ownerId);
        }

        if (!configRes.success || !configRes.data) {
            // Fallback? Or fail. For now fail.
            // If no active config, maybe use a system default? 
            // The prompt says "update the llm configuration with NEW models". 
            // We'll throw if no config.
            throw new Error('LLM Configuration not found (active or specific)');
        }

        // 3. Mark as generating
        await updateEditionStatus(newsfeedId, edition.id, 'generating');

        // 4. Fetch content
        const contents = await Promise.all(
            inputs.urls.map(async (url) => {
                const { text, imageUrls } = await fetchUrlContent(url);
                return { url, text, imageUrls };
            })
        );
        const validContents = contents.filter(c => c.text.length > 100);

        // 5. Generate
        const editionSchema: CrudHandlerConfig = {
            collectionName: 'editions',
            fields: {
                id: { type: 'string', required: true },
                date: { type: 'string', required: true },
                title: { type: 'string', required: true },
                cover: {
                    type: 'object',
                    required: true,
                    properties: {
                        title: { type: 'string', required: false },
                        summary: { type: 'string', required: true },
                        imageUrl: { type: 'string', required: false }
                    }
                },
                articles: {
                    type: 'array',
                    required: true,
                    items: {
                        type: 'object',
                        required: true,
                        properties: {
                            id: { type: 'string', required: true },
                            url: { type: 'string', required: true },
                            title: { type: 'string', required: true },
                            shortDescription: { type: 'string', required: true },
                            fullSummary: { type: 'string', required: true },
                            imageUrl: { type: 'string', required: false },
                            date: { type: 'string', required: true },
                            category: { type: 'string', required: true }
                        }
                    }
                }
            }
        };

        const prompt = `
            You are an expert news editor creating a newsletter edition.
            Instructions: "${inputs.text}"
            
            For each source, I have provided the text content and a list of potential images found on the page.
            Your goal is to select the BEST matching image URL for each article and for the cover story.
            - Prefer high-quality images (og:image usually best).
            - If no good image exists for a source, leave imageUrl empty.
            - Ensure the imageUrl is copied EXACTLY as provided.

            Source Material:
            ${validContents.map((c, i) => `
            Source ${i + 1} (${c.url}):
            Potential Images: ${c.imageUrls.join(', ')}
            Content:
            ${c.text.substring(0, 2000)}...
            `).join('\n\n')}
        `;

        const result = await ContentGenerator.generate<EditionOutput>({
            prompt,
            schema: editionSchema,
            llmConfig: configRes.data,
            images: inputs.images // User uploaded images if any
        });

        if (result.success && result.data) {
            await updateEditionStatus(newsfeedId, edition.id, 'completed', result.data);

            // Trigger deployment connections
            try {
                await triggerDeployments(ownerId, newsfeedId, edition.id, result.data);
            } catch (deployError) {
                console.error('[Deployment] Error triggering deployments:', deployError);
                // Don't fail the edition if deployment fails
            }

            revalidatePath(`/newsfeeds/${newsfeedId}`);
            return { success: true, editionId: edition.id };
        } else {
            console.error("Generator failed:", result.error);
            await updateEditionStatus(newsfeedId, edition.id, 'failed');
            return { success: false, message: result.error || 'Failed to generate content' };
        }

    } catch (error: unknown) {
        const err = error as Error;
        console.error("Edition generation failed:", err);
        await updateEditionStatus(newsfeedId, edition.id, 'failed');
        return { success: false, message: err.message || 'Generation failed' };
    }
}

async function fetchUrlContent(url: string): Promise<{ text: string, imageUrls: string[] }> {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000); // Increased to 15s

        const response = await fetch(url, {
            signal: controller.signal,
            headers: {
                // Use a standard browser UA to avoid basic blocking
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9'
            }
        });
        clearTimeout(timeoutId);

        if (!response.ok) {
            console.warn(`[fetchUrlContent] Failed to fetch ${url}: ${response.status} ${response.statusText}`);
            return { text: '', imageUrls: [] };
        }

        const html = await response.text();
        console.log(`[fetchUrlContent] Fetched ${url}: ${html.length} bytes raw HTML.`);

        // Extract Candidate Images (Meta tags)
        const imageUrls: string[] = [];

        // Open Graph Image
        const ogMatch = html.match(/<meta\s+(?:property|name)=["']og:image["']\s+content=["']([^"']+)["']/i);
        if (ogMatch && ogMatch[1]) imageUrls.push(ogMatch[1]);

        // Twitter Image
        const twMatch = html.match(/<meta\s+(?:property|name)=["']twitter:image["']\s+content=["']([^"']+)["']/i);
        if (twMatch && twMatch[1]) imageUrls.push(twMatch[1]);

        // First large image (heuristic)
        const imgMatch = html.match(/<img\s+[^>]*src=["'](https?:\/\/[^"']+)["'][^>]*>/i);
        if (imgMatch && imgMatch[1]) {
            if (!imageUrls.includes(imgMatch[1])) imageUrls.push(imgMatch[1]);
        }

        const text = html
            .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gmi, " ")
            .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gmi, " ")
            .replace(/<\/?[^>]+(>|$)/g, " ")
            .replace(/\s+/g, " ")
            .trim()
            .substring(0, 20000); // Increased limit slightly

        console.log(`[fetchUrlContent] Processed text length for ${url}: ${text.length} chars.`);

        return { text, imageUrls };
    } catch (error: unknown) {
        const err = error as Error;
        console.error(`Failed to fetch ${url}:`, err.message);
        return { text: '', imageUrls: [] };
    }
}

/**
 * Triggers deployment connections after successful edition generation
 */
async function triggerDeployments(
    ownerId: string,
    newsfeedId: string,
    editionId: string,
    output: EditionOutput
): Promise<void> {
    const { getActiveConnectionsByType } = await import('@/lib/repositories/connectionsRepository');

    // Get newsfeed details for payload
    const newsfeed = await getNewsfeedById(newsfeedId);

    // Get all triggers that respond to 'content.published' event
    const triggers = getTriggersForEvent('content.published');

    if (triggers.length === 0) {
        console.log('[Integrations] No triggers registered for content.published');
        return;
    }

    // Get active trigger connections for this user/newsfeed
    const connections = await getActiveConnectionsByType(ownerId, 'trigger', newsfeedId);

    if (connections.length === 0) {
        console.log('[Integrations] No active trigger connections found');
        return;
    }

    console.log(`[Integrations] Found ${connections.length} active connection(s), executing...`);

    // Execute each trigger for each connection
    const promises = connections.map(async (connection) => {
        // Find the trigger provider for this connection
        const trigger = triggers.find(t => t.id === connection.providerId);

        if (!trigger) {
            console.error(`[Integrations] No trigger found for provider: ${connection.providerId}`);
            return;
        }

        try {
            console.log(`[Integrations] Triggering ${connection.name} via ${trigger.name}`);

            await trigger.execute(
                'content.published',
                {
                    newsfeedId,
                    editionId,
                    newsfeedName: newsfeed?.name,
                    data: output,
                },
                connection.config
            );

            console.log(`[Integrations] ✓ Successfully triggered ${connection.name}`);
        } catch (error) {
            console.error(`[Integrations] ✗ Failed ${connection.name}:`, error);
        }
    });

    await Promise.allSettled(promises);
}
