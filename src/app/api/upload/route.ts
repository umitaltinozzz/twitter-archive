import { NextResponse } from 'next/server';
import { writeFile } from 'fs/promises';
import path from 'path';

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    
    if (!file) {
      return NextResponse.json({ success: false, error: 'Dosya bulunamadı.' }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    
    // Benzersiz bir isim veriyoruz (boşlukları silerek)
    const uniqueName = Date.now() + '-' + file.name.replaceAll(' ', '_');
    const uploadDir = path.join(process.cwd(), 'public', 'media');
    const filePath = path.join(uploadDir, uniqueName);
    
    await writeFile(filePath, buffer);
    
    // '/media/dosya_adi.jpg' şeklinde Next.js pubic klasör rotasını dönüyoruz
    const url = `/media/${uniqueName}`;
    
    return NextResponse.json({ success: true, url, type: file.type.startsWith('video') ? 'video' : 'photo' });
  } catch (error) {
    console.error('Upload Error:', error);
    return NextResponse.json({ success: false, error: 'Yükleme sırasında hata oluştu.' }, { status: 500 });
  }
}
