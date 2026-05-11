import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function GET() {
  const auth = await getCurrentUser();
  if (!auth) return NextResponse.json({ user: null });
  const user = await prisma.user.findUnique({
    where: { id: auth.sub },
    select: { id: true, displayName: true, email: true, phone: true },
  });
  return NextResponse.json({ user });
}
