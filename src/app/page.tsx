import { PrismaClient } from '@prisma/client';
import DashboardClient from './DashboardClient';

const prisma = new PrismaClient()

export default async function Home() {
  const tweets = await prisma.tweet.findMany({
    where: { parentId: null },
    orderBy: { addedAt: 'desc' },
    include: { children: { orderBy: { addedAt: 'asc' } } }
  });

  // Prisma Date nesnelerini string'e çevir (TweetData interface uyumu için)
  const serialized = JSON.parse(JSON.stringify(tweets));
  return <DashboardClient initialTweets={serialized} />;
}
