'use client';

import { useState } from 'react';
import { 
    Card, 
    Input, 
    Button, 
    Alert, 
    Stack, 
    Text, 
    Icon,
    FormField,
    Code,
    Link,
    Flex
} from '@saveaday/shared-ui';
import { Connection } from '@/lib/types';

interface GitHubConnectionFormProps {
    onSave: (connection: Connection) => void;
    onCancel: () => void;
}

interface TestResult {
    success: boolean;
    message?: string;
    error?: string;
}

export default function GitHubConnectionForm({ onSave, onCancel }: GitHubConnectionFormProps) {
    const [formData, setFormData] = useState({
        name: '',
        repository: '',
        token: '',
        branch: 'main'
    });
    const [testing, setTesting] = useState(false);
    const [testResult, setTestResult] = useState<TestResult | null>(null);
    const [saving, setSaving] = useState(false);

    const parseRepository = (input: string): string => {
        if (input.includes('github.com')) {
            const match = input.match(/github\.com\/([^\/]+\/[^\/]+)/);
            if (match) {
                return match[1].replace(/\.git$/, '');
            }
        }
        return input.trim();
    };

    const handleChange = (field: string, value: string) => {
        const newValue = field === 'repository' ? parseRepository(value) : value;
        setFormData(prev => ({ ...prev, [field]: newValue }));
        if (field === 'repository') {
            setTestResult(null);
        }
    };

    const handleTest = async () => {
        if (!formData.repository || !formData.token) {
            return;
        }

        if (!formData.repository.match(/^[\w-]+\/[\w.-]+$/)) {
            setTestResult({
                success: false,
                error: 'Invalid repository format. Use: owner/repository',
            });
            return;
        }

        setTesting(true);
        setTestResult(null);

        try {
            const response = await fetch('/api/integrations/test-connection', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    providerId: 'github-pages-deployment',
                    config: {
                        repository: formData.repository,
                        token: formData.token,
                        branch: formData.branch,
                    },
                }),
            });

            if (!response.ok) {
                throw new Error(`API error: ${response.status}`);
            }

            const result = await response.json();
            setTestResult(result);
        } catch (error) {
            setTestResult({
                success: false,
                error: error instanceof Error ? error.message : 'Test failed with unknown error',
            });
        } finally {
            setTesting(false);
        }
    };

    const handleSave = async () => {
        if (!formData.name || !formData.repository || !formData.token) {
            return;
        }

        if (!testResult?.success) {
            const confirmed = confirm('Connection has not been successfully tested. Save anyway?');
            if (!confirmed) return;
        }

        setSaving(true);

        try {
            const response = await fetch('/api/integrations/connections', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: formData.name,
                    providerId: 'github-pages-deployment',
                    type: 'trigger',
                    category: 'deployment',
                    config: {
                        repository: formData.repository,
                        token: formData.token,
                        branch: formData.branch,
                    },
                    active: true,
                }),
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
                throw new Error(errorData.error || 'Failed to save connection');
            }

            const connection = await response.json();
            onSave(connection);
        } catch (error) {
            alert('Failed to save connection');
            console.error(error);
        } finally {
            setSaving(false);
        }
    };

    return (
        <form onSubmit={(e) => { e.preventDefault(); handleSave(); }}>
            <Stack spacing={6}>
                <Stack spacing={4}>
                    <FormField label="Connection Name" required>
                        <Input
                            type="text"
                            value={formData.name}
                            onChange={(e) => handleChange('name', e.target.value)}
                            placeholder="My GitHub Pages Deployment"
                            required
                        />
                    </FormField>

                    <FormField 
                        label="Repository" 
                        required
                        description="Format: owner/repository (URLs will be auto-converted)"
                    >
                        <Input
                            type="text"
                            value={formData.repository}
                            onChange={(e) => handleChange('repository', e.target.value)}
                            placeholder="owner/repository (e.g., bigmints/dailyAI)"
                            required
                        />
                    </FormField>

                    <FormField 
                        label="GitHub Personal Access Token" 
                        required
                        description={
                            <span>
                                Requires <Code>repo</Code> scope.{' '}
                                <Link 
                                    href="https://github.com/settings/tokens/new?scopes=repo&description=SaveADay%20Deployment" 
                                    external
                                >
                                    Create token
                                    <Icon name="external-link" size="xs" />
                                </Link>
                            </span>
                        }
                    >
                        <Input
                            type="password"
                            value={formData.token}
                            onChange={(e) => handleChange('token', e.target.value)}
                            placeholder="ghp_..."
                            required
                        />
                    </FormField>

                    <FormField label="Branch">
                        <Input
                            type="text"
                            value={formData.branch}
                            onChange={(e) => handleChange('branch', e.target.value)}
                            placeholder="main"
                        />
                    </FormField>
                </Stack>

                <Card padding="md"  >
                    <Stack spacing={3}>
                        <div>
                            <Text weight="medium" size="sm">Test Connection</Text>
                            <Text color="muted" size="xs">
                                Verify that your credentials are correct
                            </Text>
                        </div>

                        <Button
                            type="button"
                            variant="outline"
                            onClick={handleTest}
                            disabled={!formData.repository || !formData.token || testing}
                            isLoading={testing}
                        >
                            {testing ? 'Testing...' : 'Test Connection'}
                        </Button>

                        {testResult && (
                            <Alert variant={testResult.success ? 'success' : 'error'}>
                                <Flex align="start" gap={2}>
                                    <Icon 
                                        name={testResult.success ? 'check-circle' : 'alert-circle'} 
                                        size="md" 
                                    />
                                    <div>
                                        {testResult.success ? (
                                            <Text size="sm">Connection successful! Repository access verified.</Text>
                                        ) : (
                                            <>
                                                <Text weight="medium" size="sm">Connection failed</Text>
                                                <Text color="muted" size="xs">
                                                    {testResult.error}
                                                </Text>
                                            </>
                                        )}
                                    </div>
                                </Flex>
                            </Alert>
                        )}
                    </Stack>
                </Card>

                <Flex justify="end" gap={3}>
                    <Button
                        type="button"
                        variant="outline"
                        onClick={onCancel}
                    >
                        Cancel
                    </Button>
                    <Button
                        type="submit"
                        variant="primary"
                        disabled={!formData.name || !formData.repository || !formData.token || saving}
                        isLoading={saving}
                    >
                        {saving ? 'Saving...' : 'Save Connection'}
                    </Button>
                </Flex>
            </Stack>
        </form>
    );
}
