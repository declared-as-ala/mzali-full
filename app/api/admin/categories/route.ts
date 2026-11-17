import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/auth';
import { categoryService } from '@/services';

const REQUIRED_CATEGORIES = [
  { name: 'Casquettes', slug: 'casquettes', description: 'Collection de casquettes tendance' },
  { name: 'Bomberses', slug: 'bomberses', description: 'Collection de vestes bombers tendance' },
];

export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const cats = await categoryService.list({ hideEmpty: false });

  for (const reqCat of REQUIRED_CATEGORIES) {
    const exists = cats.some(
      (c) =>
        c.slug.toLowerCase() === reqCat.slug ||
        c.name.trim().toLowerCase() === reqCat.name.toLowerCase(),
    );
    if (!exists) {
      try {
        const created = await categoryService.create(reqCat);
        cats.push(created);
      } catch {
        // Ignore if created concurrently
      }
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
