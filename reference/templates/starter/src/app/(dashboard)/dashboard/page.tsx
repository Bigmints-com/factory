import { getUser } from '@saveaday/shared-auth/server';
import { PageHeader, Card, Grid, Title, Text, EmptyState, Stack, Icon } from '@saveaday/shared-ui';
import { redirect } from 'next/navigation';


export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
    const user = await getUser();

    if (!user) {
        redirect('/login');
    }

    return (
        <Stack spacing={8}>
            <PageHeader
                title="Overview"
                description="Welcome to your new application. This is a placeholder dashboard."
            />

            <Grid cols={3} responsive="md">
                <Card padding="md">
                    <Stack spacing={2}>
                        <Text color="muted" size="xs" weight="medium" style={{ textTransform: 'uppercase' }}>
                            Total Items
                        </Text>
                        <Text size="3xl" weight="semibold">0</Text>
                    </Stack>
                </Card>
                <Card padding="md">
                    <Stack spacing={2}>
                        <Text color="muted" size="xs" weight="medium" style={{ textTransform: 'uppercase' }}>
                            Active Users
                        </Text>
                        <Text size="3xl" weight="semibold" color="success">0</Text>
                    </Stack>
                </Card>
                <Card padding="md">
                    <Stack spacing={2}>
                        <Text color="muted" size="xs" weight="medium" style={{ textTransform: 'uppercase' }}>
                            Revenue
                        </Text>
                        <Text size="3xl" weight="semibold" color="primary">$0.00</Text>
                    </Stack>
                </Card>
            </Grid>

            <Stack spacing={4}>
                <div>
                    <Title level="h2">Recent Activity</Title>
                    <Text color="muted" size="sm">
                        Your latest application events will appear here.
                    </Text>
                </div>

                <Card padding="md">
                    <EmptyState
                        icon={<Icon name="activity" />}
                        title="No recent activity"
                        description="Your latest application events will appear here once you start using the app."
                    />
                </Card>
            </Stack>
        </Stack>
    );
}
