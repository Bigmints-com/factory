import { getUser } from '@saveaday/shared-auth/server';
import { 
    PageHeader, 
    Card, 
    Input, 
    Select, 
    Switch, 
    Title, 
    Text, 
    Stack, 
    Alert, 
    Button,
    FormField,
    Flex
} from '@saveaday/shared-ui';
import { redirect } from 'next/navigation';
import { LLMSettingsSection } from '@saveaday/llm-config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
    const user = await getUser();

    if (!user) {
        redirect('/login');
    }

    return (
        <Stack spacing={6}>
            <PageHeader
                title="Settings"
                description="Manage your account settings and preferences"
            />

            <Stack spacing={6}>
                {/* Profile Section */}
                <Card padding="md">
                    <Stack spacing={4}>
                        <Title level="h2">Profile</Title>
                        <FormField label="Name">
                            <Input
                                type="text"
                                value={user.displayName || 'Not set'}
                                disabled
                            />
                        </FormField>
                        <FormField label="Email">
                            <Input
                                type="email"
                                value={user.email || 'Not set'}
                                disabled
                            />
                        </FormField>
                        <FormField label="User ID">
                            <Input
                                type="text"
                                value={user.uid}
                                disabled
                            />
                        </FormField>
                    </Stack>
                </Card>

                {/* Notifications Section */}
                <Card padding="md">
                    <Stack spacing={4}>
                        <Title level="h2">Notifications</Title>
                        <Flex justify="between" align="center">
                            <div>
                                <Text weight="medium" size="sm">Email Notifications</Text>
                                <Text color="muted" size="sm">Receive email updates and alerts</Text>
                            </div>
                            <Switch disabled />
                        </Flex>
                        <Flex justify="between" align="center">
                            <div>
                                <Text weight="medium" size="sm">Push Notifications</Text>
                                <Text color="muted" size="sm">Receive browser push notifications</Text>
                            </div>
                            <Switch disabled />
                        </Flex>
                    </Stack>
                </Card>

                {/* Account Section */}
                <Card padding="md">
                    <Stack spacing={4}>
                        <Title level="h2">Account</Title>
                        <FormField label="Timezone">
                            <Select 
                                disabled 
                                options={[{ value: 'utc', label: 'UTC (Coordinated Universal Time)' }]}
                                defaultValue="utc"
                            />
                        </FormField>
                        <FormField label="Language">
                            <Select 
                                disabled
                                options={[{ value: 'en', label: 'English' }]}
                                defaultValue="en"
                            />
                        </FormField>
                    </Stack>
                </Card>

                {/* LLM Configuration */}
                <LLMSettingsSection />

                {/* Danger Zone */}
                <Alert variant="error" padding="md">
                    <Stack spacing={4}>
                        <Title level="h2">Danger Zone</Title>
                        <Flex justify="between" align="center">
                            <div>
                                <Text weight="medium" size="sm">Delete Account</Text>
                                <Text color="muted" size="sm">Permanently delete your account and all data</Text>
                            </div>
                            <Button variant="danger" disabled>
                                Delete Account
                            </Button>
                        </Flex>
                    </Stack>
                </Alert>

                <Text color="muted" size="sm">
                    Note: Most settings are currently view-only. Full configuration will be available soon.
                </Text>
            </Stack>
        </Stack>
    );
}
