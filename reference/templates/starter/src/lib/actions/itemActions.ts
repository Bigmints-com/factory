'use server';

import { itemsApi } from '../api-client';
import { revalidatePath } from 'next/cache';

/**
 * Server action to create a new item
 */
export async function createItem(formData: FormData) {
    const name = formData.get('name');
    const description = formData.get('description');

    try {
        await itemsApi.create({
            name,
            description,
            createdAt: new Date().toISOString(),
        });

        revalidatePath('/items');
        return { success: true };
    } catch (error) {
        console.error('Error creating item:', error);
        return { success: false, error: 'Failed to create item' };
    }
}

/**
 * Server action to update an item
 */
export async function updateItem(id: string, formData: FormData) {
    const name = formData.get('name');
    const description = formData.get('description');

    try {
        await itemsApi.update(id, {
            name,
            description,
            updatedAt: new Date().toISOString(),
        });

        revalidatePath('/items');
        return { success: true };
    } catch (error) {
        console.error('Error updating item:', error);
        return { success: false, error: 'Failed to update item' };
    }
}

/**
 * Server action to delete an item
 */
export async function deleteItem(id: string) {
    try {
        await itemsApi.delete(id);
        revalidatePath('/items');
        return { success: true };
    } catch (error) {
        console.error('Error deleting item:', error);
        return { success: false, error: 'Failed to delete item' };
    }
}
