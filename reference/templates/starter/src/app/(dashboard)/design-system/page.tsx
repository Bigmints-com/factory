'use client';

import { useState } from 'react';
import {
    PageHeader,
    Card,
    Stack,
    Grid,
    Section,
    SectionHeader,
    SectionTitle,
    SectionDescription,
    Title,
    Text,
    Button,
    Badge,
    Icon,
    Input,
    Label,
    Checkbox,
    Switch,
    RadioGroup,
    RadioGroupItem,
    Select,
    Divider,
    Flex,
    FormField,
    SearchInput,
    Combobox,
    TagInput,
    Alert,
    EmptyState,
    Spinner,
    LoadingSkeleton,
    Breadcrumbs,
    Tabs,
    TabsList,
    TabsTrigger,
    TabsContent,
    Pagination,
    OverviewCard,
    SmartTable,
    DeleteConfirmationModal,
    ConfirmDialog,
    Accordion,
    AccordionItem,
    AccordionTrigger,
    AccordionContent,
    StatusBadge,
    LoadingButton,
    TextArea,
    Logo,
    Link,
    Code,
    CodeBlock,
    Popover,
    PopoverTrigger,
    PopoverContent,
    Container,
    FilterDropdown,
    ImageUploadInput,
    FormGroup,
    ErrorMessage,
    HeroSection,
    AgentCard,
    SpaceCard,
    EntityCard,
    ConnectorCard,
    TemplateCard,
    ChatInput,
    AIAssistantButton,
    FileUploader,
    ApiTokenDisplay,
    FilterBar,
    TeamSwitcher,
    SAVEDAY_APPS,
    Footer,
    BrandColorPicker,
    ActionsPanel,
    FormBrandingSection,
    FormExperienceSection,
    ShareModal,
} from '@saveaday/shared-ui';
import { AIMode } from '@saveaday/shared-ui/ui/domain/AIAssistantButton';

// Sample data for SmartTable
const sampleTableData = [
    { id: 1, name: 'John Doe', email: 'john@example.com', status: 'active' },
    { id: 2, name: 'Jane Smith', email: 'jane@example.com', status: 'pending' },
    { id: 3, name: 'Bob Johnson', email: 'bob@example.com', status: 'inactive' },
];

const tableColumns = [
    { key: 'name', header: 'Name', sortable: true },
    { key: 'email', header: 'Email' },
    { key: 'status', header: 'Status' },
];

// Mock data for Domain components
const mockAgent = {
    id: 'agent-1',
    name: 'Research Assistant',
    description: 'Specializes in web research and data synthesis.',
    status: 'active' as const,
    lastUsed: new Date().toISOString(),
    capabilities: ['Web Search', 'Data Extraction', 'Synthesis'],
};

const mockSpace = {
    id: 'space-1',
    name: 'Marketing Team',
    description: 'Shared space for marketing assets and coordination.',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    widgetCount: 12,
    isActive: true,
};

const mockConnector = {
    id: 'conn-1',
    name: 'GitHub',
    description: 'Sync issues and pull requests to your workspace.',
    status: 'connected' as const,
    type: 'oauth2',
    lastSync: new Date().toISOString(),
};

const mockConnectorPlugin = {
    manifest: {
        name: 'GitHub',
        description: 'Connect your GitHub repositories.',
        category: 'Development',
        author: 'SaveADay',
        version: '1.0.0',
    },
    authConfig: {
        type: 'oauth2',
    },
    isBuiltIn: true,
    actions: [{ name: 'Sync Issues' }, { name: 'Track PRs' }],
};

const mockTemplate = {
    id: 'temp-1',
    name: 'Project Starter',
    description: 'Standardized project layout with common tools.',
    category: 'Engineering',
    difficulty: 'Beginner' as const,
    tags: ['Next.js', 'Tailwind', 'TypeScript'],
    widgetCount: 8,
    estimatedSetupTime: 5,
    dataSources: ['GitHub', 'Jira'],
    widgets: [
        { id: 'w1', title: 'Task List', type: 'list' },
        { id: 'w2', title: 'Burndown', type: 'chart' },
    ],
};

export default function DesignSystemPage() {
    const [switchValue, setSwitchValue] = useState(false);
    const [checkboxValue, setCheckboxValue] = useState(false);
    const [radioValue, setRadioValue] = useState('option1');
    const [searchValue, setSearchValue] = useState('');
    const [tags, setTags] = useState(['React', 'TypeScript']);
    const [comboValue, setComboValue] = useState('');
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [isConfirmOpen, setIsConfirmOpen] = useState(false);
    const [isShareModalOpen, setIsShareModalOpen] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    const [isLoading, setIsLoading] = useState(false);
    const [brandColor, setBrandColor] = useState('#6366f1');

    // FilterBar states
    const [filterSearch, setFilterSearch] = useState('');
    const [filterCategory, setFilterCategory] = useState('all');
    const [filterDifficulties, setFilterDifficulties] = useState<string[]>([]);
    const [filterTags, setFilterTags] = useState<string[]>([]);

    const filterCategories = [
        { label: 'Engineering', value: 'eng' },
        { label: 'Marketing', value: 'mkt' },
        { label: 'Sales', value: 'sales' },
    ];

    const filterDifficultiesOptions = [
        { label: 'Beginner', value: 'Beginner' },
        { label: 'Intermediate', value: 'Intermediate' },
        { label: 'Advanced', value: 'Advanced' },
    ];

    const availableTags = ['React', 'TypeScript', 'Next.js', 'Tailwind', 'Python', 'Go'];

    const comboOptions = [
        { value: 'react', label: 'React' },
        { value: 'vue', label: 'Vue' },
        { value: 'angular', label: 'Angular' },
        { value: 'svelte', label: 'Svelte' },
    ];

    return (
        <Stack spacing={12}>
            <PageHeader
                title="Design System"
                description="Comprehensive component library showcase for @saveaday/shared-ui"
            />

            {/* Base Components */}
            <Section>
                <SectionHeader>
                    <SectionTitle>Base Components</SectionTitle>
                    <SectionDescription>Core building blocks of the UI</SectionDescription>
                </SectionHeader>
                {/* Buttons */}
                <Card >
                    <Stack spacing={4}>
                        <Title level="h3">Buttons</Title>
                        <Flex gap={2} >
                            <Button variant="default">Default</Button>
                            <Button variant="secondary">Secondary</Button>
                            <Button variant="outline">Outline</Button>
                            <Button variant="ghost">Ghost</Button>
                            <Button variant="destructive">Destructive</Button>
                            <Button disabled>Disabled</Button>
                        </Flex>
                        <Flex gap={2} >
                            <LoadingButton
                                isLoading={isLoading}
                                onClick={() => {
                                    setIsLoading(true);
                                    setTimeout(() => setIsLoading(false), 2000);
                                }}
                            >
                                LoadingButton
                            </LoadingButton>
                            <Button size="sm">Small</Button>
                            <Button size="default">Default</Button>
                            <Button size="lg">Large</Button>
                            <Button size="icon"><Icon name="Plus" /></Button>
                        </Flex>
                    </Stack>
                </Card>

                {/* Badge & StatusBadge */}
                <Card >
                    <Stack spacing={4}>
                        <Title level="h3">Badges</Title>
                        <Flex gap={2} >
                            <Badge>Default</Badge>
                            <Badge variant="secondary">Secondary</Badge>
                            <Badge variant="outline">Outline</Badge>
                            <Badge variant="destructive">Destructive</Badge>
                        </Flex>
                        <Flex gap={2} >
                            <StatusBadge status="success">Active</StatusBadge>
                            <StatusBadge status="warning">Pending</StatusBadge>
                            <StatusBadge status="error">Failed</StatusBadge>
                            <StatusBadge status="info">Info</StatusBadge>
                        </Flex>
                    </Stack>
                </Card>

                {/* Typography & Links */}
                <Card >
                    <Stack spacing={6}>
                        <Title level="h3">Typography & Links</Title>
                        <Grid cols={2} responsive="md">
                            <Stack spacing={2}>
                                <Title level="h1">Heading 1</Title>
                                <Title level="h2">Heading 2</Title>
                                <Title level="h3">Heading 3</Title>
                                <Text size="lg">Large text body specifically for content emphasis.</Text>
                                <Text>Default text body for standard reading experience across all apps.</Text>
                                <Text size="sm" color="muted">Small muted text for labels or context.</Text>
                            </Stack>
                            <Stack spacing={4}>
                                <Flex gap={2} style={{ alignItems: 'center' }}>
                                    <Logo />
                                    <Logo showText={false} size={32} />
                                </Flex>
                                <Stack spacing={1}>
                                    <Link href="#">Standard Link</Link>
                                    <Link href="#"  >Muted Link</Link>
                                </Stack>
                                <Stack spacing={2}>
                                    <Code>npm install @saveaday/shared-ui</Code>
                                    <CodeBlock code={`const hello = "world";\nconsole.log(hello);`} language="typescript" />
                                </Stack>
                            </Stack>
                        </Grid>
                    </Stack>
                </Card>

                {/* Form Controls */}
                <Card padding="md">
                    <Stack spacing={6}>
                        <Title level="h3">Form Elements</Title>
                        <Grid cols={2} responsive="md">
                            <Stack spacing={4}>
                                <Stack spacing={2}>
                                    <Label htmlFor="demo-input">Input</Label>
                                    <Input id="demo-input" placeholder="Enter text..." />
                                </Stack>
                                <Stack spacing={2}>
                                    <Label htmlFor="demo-textarea">TextArea</Label>
                                    <TextArea id="demo-textarea" placeholder="Enter long text..." />
                                </Stack>
                            </Stack>
                            <Stack spacing={4}>
                                <Flex gap={6}>
                                    <Flex gap={2} style={{ alignItems: 'center' }}>
                                        <Checkbox id="cb1" checked={checkboxValue} onCheckedChange={(v) => setCheckboxValue(v === true)} />
                                        <Label htmlFor="cb1">Checkbox</Label>
                                    </Flex>
                                    <Flex gap={2} style={{ alignItems: 'center' }}>
                                        <Switch id="sw1" checked={switchValue} onCheckedChange={setSwitchValue} />
                                        <Label htmlFor="sw1">Switch</Label>
                                    </Flex>
                                </Flex>
                                <Stack spacing={2}>
                                    <Label>RadioGroup</Label>
                                    <RadioGroup value={radioValue} onValueChange={setRadioValue}>
                                        <Flex gap={4}>
                                            <Flex gap={2} style={{ alignItems: 'center' }}>
                                                <RadioGroupItem value="option1" id="r1" />
                                                <Label htmlFor="r1">Option 1</Label>
                                            </Flex>
                                            <Flex gap={2} style={{ alignItems: 'center' }}>
                                                <RadioGroupItem value="option2" id="r2" />
                                                <Label htmlFor="r2">Option 2</Label>
                                            </Flex>
                                        </Flex>
                                    </RadioGroup>
                                </Stack>
                                <Select
                                    label="Basic Select"
                                    options={[
                                        { label: 'Option 1', value: 'opt1' },
                                        { label: 'Option 2', value: 'opt2' },
                                    ]}
                                />
                            </Stack>
                        </Grid>
                    </Stack>
                </Card>

                {/* Overlays */}
                <Card padding="md">
                    <Stack spacing={4}>
                        <Title level="h3">Popovers & Overlays</Title>
                        <Flex gap={4}>
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button variant="outline">Open Popover</Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-80">
                                    <Stack spacing={2}>
                                        <Title level="h4">Popover Content</Title>
                                        <Text size="sm">This is a popover for contextual information.</Text>
                                    </Stack>
                                </PopoverContent>
                            </Popover>

                            <Accordion type="single" collapsible className="w-full max-w-md">
                                <AccordionItem value="item-1">
                                    <AccordionTrigger>Accordion Trigger</AccordionTrigger>
                                    <AccordionContent>
                                        Expanded content for the accordion component.
                                    </AccordionContent>
                                </AccordionItem>
                            </Accordion>
                        </Flex>
                    </Stack>
                </Card>
            </Section>

            {/* Layout Components */}
            <Section>
                <SectionHeader>
                    <SectionTitle>Layout & Grid</SectionTitle>
                    <SectionDescription>Structural components and containers</SectionDescription>
                </SectionHeader>
                <Card padding="md">
                    <Stack spacing={6}>
                        <Container>
                            <Title level="h3">Container & Flex</Title>
                            <Text color="muted" size="sm" className="mb-4">Containers constrain width, Flex manages alignment.</Text>
                            <Flex justify="between" align="center" className="bg-slate-50 p-4 rounded-lg border border-dashed border-slate-300">
                                <Badge>Aligned Left</Badge>
                                <Flex gap={2}>
                                    <Badge variant="secondary">Aligned Right 1</Badge>
                                    <Badge variant="secondary">Aligned Right 2</Badge>
                                </Flex>
                            </Flex>
                        </Container>
                        <Divider />
                        <Stack spacing={2}>
                            <Title level="h3">Grid System</Title>
                            <Grid cols={4} gap={4}>
                                {[1, 2, 3, 4].map(i => (
                                    <div key={i} className="aspect-video bg-slate-100 rounded flex items-center justify-center border">
                                        Grid {i}
                                    </div>
                                ))}
                            </Grid>
                        </Stack>
                    </Stack>
                </Card>
            </Section>

            {/* Form & Navigation */}
            <Section>
                <SectionHeader>
                    <SectionTitle>Forms & Navigation</SectionTitle>
                    <SectionDescription>Advanced input and directional components</SectionDescription>
                </SectionHeader>
                <Grid cols={2} responsive="md">
                    <Card padding="md">
                        <Stack spacing={4}>
                            <Title level="h3">Advanced Forms</Title>
                            <FormField label="Smart Field" description="Field with description and error">
                                <Input placeholder="Input inside FormField" />
                            </FormField>
                            <SearchInput placeholder="Search shared components..." />
                            <Combobox 
                                options={comboOptions} 
                                placeholder="Select framework" 
                                value={comboValue}
                                onValueChange={setComboValue}
                            />
                            <TagInput tags={tags} onTagsChange={setTags} placeholder="Add technologies" />
                        </Stack>
                    </Card>
                    <Card padding="md">
                        <Stack spacing={6}>
                            <Title level="h3">Navigation</Title>
                            <Breadcrumbs items={[{ label: 'Home' }, { label: 'Library' }, { label: 'Design' }]} />
                            <Tabs defaultValue="t1">
                                <TabsList>
                                    <TabsTrigger value="t1">Overview</TabsTrigger>
                                    <TabsTrigger value="t2">Details</TabsTrigger>
                                </TabsList>
                                <TabsContent value="t1"><Text size="sm">Overview content goes here.</Text></TabsContent>
                                <TabsContent value="t2"><Text size="sm">Detail data visualization.</Text></TabsContent>
                            </Tabs>
                            <Pagination currentPage={currentPage} totalPages={10} onPageChange={setCurrentPage} />
                        </Stack>
                    </Card>
                </Grid>
                <Card padding="md">
                    <Stack spacing={4}>
                        <Title level="h3">Additional Form Components</Title>
                        <Grid cols={2} responsive="md">
                            <FormGroup title="User Profile" description="Basic account information">
                                <FormField label="Display Name">
                                    <Input placeholder="John Doe" />
                                </FormField>
                            </FormGroup>
                            <FileUploader onFileSelect={() => {}} label="Upload assets" />
                        </Grid>
                        <Grid cols={2} responsive="md">
                           <ImageUploadInput label="Brand Logo" onUpload={() => {}} />
                           <FilterDropdown 
                                label="Status" 
                                options={[{ label: 'Active', value: 'a' }, { label: 'Inactive', value: 'i' }]} 
                                onSelect={() => {}}
                            />
                        </Grid>
                    </Stack>
                </Card>
            </Section>

            {/* Feedback components */}
            <Section>
                <SectionHeader>
                    <SectionTitle>Feedback & Error handling</SectionTitle>
                    <SectionDescription>Communicating state to the user</SectionDescription>
                </SectionHeader>
                <Grid cols={2} responsive="md">
                    <Card padding="md">
                        <Stack spacing={4}>
                            <Title level="h3">Alerts & Messaging</Title>
                            <Alert variant="default">Informational message for users.</Alert>
                            <Alert variant="destructive">Critical error that requires attention.</Alert>
                            <ErrorMessage message="Failed to sync with provider. Please try again." />
                        </Stack>
                    </Card>
                    <Card padding="md">
                        <Stack spacing={4}>
                            <Title level="h3">Empty State</Title>
                            <EmptyState 
                                title="No data found" 
                                description="Try adjusting your filters or search." 
                                icon={<Icon name="Database" />}
                                action={<Button size="sm">Reset</Button>}
                            />
                        </Stack>
                    </Card>
                </Grid>
                <Card padding="md">
                    <Title level="h3">Loading Indicators</Title>
                    <Flex gap={8} align="center">
                        <Spinner size="lg" />
                        <Stack className="flex-1" spacing={2}>
                            <LoadingSkeleton variant="text" />
                            <LoadingSkeleton variant="rectangular" className="h-20" />
                        </Stack>
                    </Flex>
                </Card>
            </Section>

            {/* Domain Specific Components */}
            <Section>
                <SectionHeader>
                    <SectionTitle>Domain Components</SectionTitle>
                    <SectionDescription>Business objects and AI integration</SectionDescription>
                </SectionHeader>
                <Grid cols={3} responsive="md">
                    <AgentCard agent={mockAgent} />
                    <SpaceCard space={mockSpace} />
                    <ConnectorCard connector={mockConnector} plugin={mockConnectorPlugin} />
                </Grid>
                <Grid cols={3} responsive="md">
                    <TemplateCard template={mockTemplate} onSelect={() => {}} />
                    <EntityCard 
                        title="Main Contact" 
                        id="user-123" 
                        status="active" 
                        description="Primary stakeholder for the project."
                    />
                    <ApiTokenDisplay token="sk_live_51P..." onRotate={() => {}} />
                </Grid>
                <Card padding="md">
                    <Stack spacing={4}>
                        <Title level="h3">AI Interaction</Title>
                        <ChatInput onSend={() => {}} isLoading={false} />
                        <Flex gap={4}>
                            <AIAssistantButton onModeSelect={function (mode: AIMode): void {
                                throw new Error('Function not implemented.');
                            } } />
                        </Flex>
                        <Divider />
                        <Title level="h3">Advanced Filtering</Title>
                        <FilterBar 
                            searchValue={filterSearch}
                            onSearchChange={setFilterSearch}
                            categories={filterCategories}
                            selectedCategory={filterCategory}
                            onCategoryChange={setFilterCategory}
                            difficulties={filterDifficultiesOptions}
                            selectedDifficulties={filterDifficulties}
                            onDifficultiesChange={setFilterDifficulties}
                            tags={availableTags}
                            selectedTags={filterTags}
                            onTagsChange={setFilterTags}
                            onClearFilters={() => {
                                setFilterSearch('');
                                setFilterCategory('all');
                                setFilterDifficulties([]);
                                setFilterTags([]);
                            }}
                        />
                    </Stack>
                </Card>
            </Section>

            {/* Composite Components */}
            <Section>
                <SectionHeader>
                    <SectionTitle>High-Level Patterns</SectionTitle>
                    <SectionDescription>Complex composite components</SectionDescription>
                </SectionHeader>
                <HeroSection 
                    title="Welcome to SaveADay" 
                    subtitle="Streamline your workflow with our intelligent platform."
                    actions={<Button size="lg">Get Started</Button>}
                />
                <Grid cols={3} responsive="md">
                    <OverviewCard 
                        title="Revenue" 
                        value="$42,500" 
                        icon={<Icon name="DollarSign" />} 
                        trend={{ value: 12, direction: 'up', label: 'vs last month' }} 
                    />
                    <OverviewCard 
                        title="Users" 
                        value="12.5k" 
                        icon={<Icon name="Users" />} 
                        trend={{ value: 3, direction: 'down', label: 'vs last week' }} 
                    />
                    <OverviewCard 
                        title="Conversion" 
                        value="3.2%" 
                        icon={<Icon name="TrendingUp" />} 
                        trend={{ value: 0.5, direction: 'up', label: 'vs yesterday' }} 
                    />
                </Grid>
                <Card padding="none">
                    <SmartTable data={sampleTableData} columns={tableColumns} />
                </Card>
            </Section>

            {/* App & Admin Components */}
            <Section>
                <SectionHeader>
                    <SectionTitle>App & Admin</SectionTitle>
                    <SectionDescription>Platform-level controls and branding</SectionDescription>
                </SectionHeader>
               <Grid cols={2} responsive="md">
                   <Card padding="md">
                        <Stack spacing={4}>
                            <Title level="h3">Branding Controls</Title>
                            <BrandColorPicker color={brandColor} onChange={setBrandColor} />
                            <FormBrandingSection 
                                brandColor={brandColor}
                                onBrandColorChange={setBrandColor}
                                buttonText="Submit"
                                renderErrors={() => null}
                            />
                        </Stack>
                   </Card>
                   <Card padding="md">
                        <Stack spacing={4}>
                            <Title level="h3">Experience & Actions</Title>
                            <ActionsPanel 
                                title="Page Actions" 
                                actions={[
                                    { label: 'Export Data', icon: 'Download', onClick: () => {} },
                                    { label: 'Invite User', icon: 'UserPlus', onClick: () => {} }
                                ]} 
                            />
                            <FormExperienceSection 
                                successMessage="Thanks for your response!"
                                renderErrors={() => null}
                            />
                        </Stack>
                   </Card>
               </Grid>
               <Card padding="md">
                   <Title level="h3">App Shell Parts</Title>
                   <Flex gap={8} wrap>
                        <div className="w-64 border rounded p-2">
                             <Text size="xs" weight="bold" className="mb-2">TeamSwitcher</Text>
                             <TeamSwitcher teams={SAVEDAY_APPS.map(app => ({
                               name: app.name,
                               logo: app.logo,
                               plan: "Platform",
                               url: app.url,
                               color: app.color,
                               key: app.key
                             }))} currentAppName="Design System" />
                        </div>
                        <div className="flex-1 min-w-[300px] border rounded p-4 flex flex-col">
                             <Text size="xs" weight="bold" className="mb-2">Footer Mock</Text>
                             <Footer />
                        </div>
                   </Flex>
               </Card>
            </Section>

            {/* Modals & Dialogs Showcase */}
            <Section>
                <SectionHeader>
                    <SectionTitle>Dialogs & Modals</SectionTitle>
                    <SectionDescription>Click to trigger interactive dialogs</SectionDescription>
                </SectionHeader>
                <Card padding="md">
                    <Flex gap={4} wrap>
                        <Button variant="outline" onClick={() => setIsShareModalOpen(true)}>Share Modal</Button>
                        <Button variant="destructive" onClick={() => setIsDeleteModalOpen(true)}>Delete Confirmation</Button>
                        <Button variant="secondary" onClick={() => setIsConfirmOpen(true)}>Generic Confirmation</Button>
                    </Flex>
                </Card>
            </Section>

            {/* Modal Handlers */}
            <ShareModal isOpen={isShareModalOpen} onClose={() => setIsShareModalOpen(false)} url="https://saveaday.com" />
            <DeleteConfirmationModal
                isOpen={isDeleteModalOpen}
                onClose={() => setIsDeleteModalOpen(false)}
                onConfirm={() => setIsDeleteModalOpen(false)}
                title="Delete Component?"
                description="This will permanently delete the selected component from the database."
            />
            <ConfirmDialog 
                open={isConfirmOpen} 
                onOpenChange={setIsConfirmOpen} 
                onConfirm={() => setIsConfirmOpen(false)}
                title="Save Changes?"
                description="Are you sure you want to apply these custom design changes?"
            />
        </Stack>
    );
}
