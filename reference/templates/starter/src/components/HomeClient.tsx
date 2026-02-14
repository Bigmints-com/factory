'use client';

import { useRouter } from 'next/navigation';
import { useUser } from '@saveaday/shared-auth/client';
import type { User } from '@saveaday/shared-auth/session';
import { PublicHomepage } from '@saveaday/shared-ui';

interface HomeClientProps {
    initialUser?: User | null;
}

export default function HomeClient({ initialUser }: HomeClientProps) {
    const router = useRouter();
    const { user: clientUser } = useUser();
    const user = initialUser || clientUser;
    const isLoggedIn = !!user;

    const handlePrimaryAction = () => {
        router.push(isLoggedIn ? '/dashboard' : '/register');
    };

    const handleLoginAction = () => {
        router.push('/login');
    };

    return (
        <PublicHomepage
            appName="Starter"
            brandColor="#3b82f6"
            isLoggedIn={isLoggedIn}
            hero={{
                title: "Your new app starts here",
                description: "Build your next SaveADay microservice in minutes with authentication, dashboard, and API endpoints ready to go. Focus on your unique features while we handle the foundation."
            }}
            features={[
                {
                    title: "Authentication ready",
                    description: "Google OAuth integration built-in. Let users sign in and get started immediately—no complex auth setup required."
                },
                {
                    title: "Dashboard included",
                    description: "A complete dashboard with sidebar navigation, app switcher, and user menu. Customize it to fit your needs."
                },
                {
                    title: "API connected",
                    description: "Full CRUD API endpoints with Firestore integration. Create, read, update, and delete your resources with secure, scalable backend support."
                }
            ]}
            faqs={[
                {
                    question: "What is the Starter app?",
                    answer: "The Starter app is a template for creating new microservices in the SaveADay ecosystem. It includes authentication, a dashboard, API endpoints, and all the infrastructure you need to get started quickly."
                },
                {
                    question: "How do I use it?",
                    answer: "Copy the starter directory to create a new app, update the configuration, and start building your unique features. Follow the app development guide for step-by-step instructions."
                },
                {
                    question: "What's included?",
                    answer: "Authentication with Google OAuth, a dashboard with sidebar navigation, Firestore database integration, API endpoints for CRUD operations, and deployment configuration for Google Cloud Run."
                },
                {
                    question: "Can I customize it?",
                    answer: "Absolutely! The starter app is designed to be fully customizable. Change the branding, add your own features, modify the dashboard, and build exactly what you need."
                },
                {
                    question: "Is it production ready?",
                    answer: "Yes! The starter app includes everything you need to deploy to production, including Docker configuration, environment variable management, and Cloud Run deployment scripts."
                },
                {
                    question: "How do I add new features?",
                    answer: "Follow the feature development guide in the .agent/rules directory. Add new API endpoints, create UI components, and integrate with shared packages to build your app's unique functionality."
                }
            ]}
            onPrimaryAction={handlePrimaryAction}
            onLoginAction={handleLoginAction}
            primaryLabel={isLoggedIn ? "View Dashboard" : "Get Started"}
        />
    );
}
