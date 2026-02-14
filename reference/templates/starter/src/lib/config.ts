import appConfig from '../../app.config.json';

export interface AppConfig {
    metadata: {
        name: string;
        displayName: string;
        slug: string;
        description: string;
        icon: string;
        color: string;
        group: string;
    };
    deployment: {
        projectId: string;
        serviceName: string;
        region: string;
        customDomain: string;
        port: number;
    };
    firestore: {
        databaseId: string;
        collections: string[];
    };
    routes: {
        public: string[];
        protected: string[];
    };
}

export function getAppConfig(): AppConfig {
    return appConfig as AppConfig;
}

export function getDatabaseId(): string {
    return appConfig.firestore.databaseId;
}

export function getPort(): number {
    return appConfig.deployment.port;
}
