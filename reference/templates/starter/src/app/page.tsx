import { getUser } from '@saveaday/shared-auth/session';
import HomeClient from '@/components/HomeClient';

export default async function Home() {
    const user = await getUser();

    return <HomeClient initialUser={user} />;
}
