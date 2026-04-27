import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// POST: Yeni Manuel Gönderi Ekleme
export async function POST(request: Request) {
  try {
    const data = await request.json();
    
    // Rastgele benzersiz bir ID uyduruyoruz
    const randomId = Date.now().toString() + Math.floor(Math.random() * 1000).toString();

    const newTweet = await prisma.tweet.create({
      data: {
        id: randomId,
        type: data.parentId ? 'thread' : 'manuel', 
        url: data.url || '',
        authorName: data.authorName || 'Manuel Eklenti',
        authorUsername: data.authorUsername || 'manuel',
        text: data.text || '',
        createdAt: new Date().toISOString(),
        projectName: data.projectName || null,
        tags: data.tags || null,
        media: data.media ? JSON.stringify(data.media) : null,
        parentId: data.parentId || null,
      }
    });

    return NextResponse.json({ success: true, tweet: newTweet });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ success: false, error: 'Kayıt başarısız.' }, { status: 500 });
  }
}
