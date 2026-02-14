'use client';

import { PageHeader, Button, Card, EmptyState, EntityCard, Stack, Icon } from '@saveaday/shared-ui';

export default function ItemsPage() {
    return (
        <Stack spacing={6}>
            <PageHeader
                title="Items"
                description="Manage your items"
            >
                <Button variant="primary">
                    <Icon name="plus" size="sm" />
                    Create Item
                </Button>
            </PageHeader>

            {/* Items List/Table */}
            <Card padding="md">
                <EmptyState
                    icon={<Icon name="layers" />}
                    title="No items yet"
                    description="Get started by creating your first item"
                    actionLabel="Create Your First Item"
                    onAction={() => console.log('Create item')}
                />
            </Card>

            {/* Example of how items would be displayed */}
            <Card padding="md" style={{ borderStyle: 'dashed', opacity: 0.5 }}>
                <EntityCard
                    icon={<Icon name="file-text" />}
                    title="Example Item"
                    description="Created: Today"
                    footer={
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <Button variant="ghost" size="sm">Edit</Button>
                            <Button variant="danger" size="sm">Delete</Button>
                        </div>
                    }
                />
                <p style={{ marginTop: '1rem', fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>
                    This is what your items will look like once you create them.
                </p>
            </Card>
        </Stack>
    );
}
