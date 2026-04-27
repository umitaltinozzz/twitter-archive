import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// PUT: Güncelleme (Tag, Proje vs)
export async function PUT(request: Request, context: any) {
  try {
    // context.params'ı parse ederken warning'i atlatmak için
    const params = await context.params;
    const body = await request.json();
    
    const updatedTweet = await prisma.tweet.update({
      where: { id: params.id },
      data: {
        tags: body.tags !== undefined ? body.tags : undefined,
        projectName: body.projectName !== undefined ? body.projectName : undefined,
        notes: body.notes !== undefined ? body.notes : undefined,
      }
    });
    
    return NextResponse.json({ success: true, tweet: updatedTweet });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ success: false, error: 'Güncelleme başarısız.' }, { status: 500 });
  }
}

// DELETE: Gönderiyi Silme
export async function DELETE(request: Request, context: any) {
  try {
    const params = await context.params;
    await prisma.tweet.delete({
      where: { id: params.id }
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ success: false, error: 'Silme başarısız.' }, { status: 500 });
  }
}
