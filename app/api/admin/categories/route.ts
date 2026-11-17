import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/auth';
import { categoryService } from '@/services';

export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const cats = await categoryService.list({ hideEmpty: false });
  const hasCasquettes = cats.some(
    (c) => c.slug.toLowerCase() === 'casquettes' || c.name.trim().toLowerCase() === 'casquettes',
  );
  if (!hasCasquettes) {
    try {
      const created = await categoryService.create({
        name: 'Casquettes',
        slug: 'casquettes',
        description: 'Collection de casquettes tendance',
      });
      cats.push(created);
    } catch {
      // Ignore if created concurrently
    }
  }
  return NextResponse.json(cats);
}

export async function POST(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  try {
    const body = await req.json();
    const cat = await categoryService.create(body);
    return NextResponse.json(cat);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'create failed' }, { status: 500 });
  }
}
