import type { Metadata } from "next";

import "./globals.css";
import { fontVariables, Toaster } from '@saveaday/shared-ui';

export const metadata: Metadata = {
    title: "Starter App | SaveADay",
    description: "Template for creating new SaveADay apps",
    icons: {
        icon: "/favicon.ico",
    },
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="en" className={fontVariables}>
            <body className="antialiased">
                {children}
                <Toaster />
            </body>
        </html>
    );
}
