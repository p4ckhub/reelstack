import { NextResponse } from 'next/server';
import { registry } from '@/lib/metrics';

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get('token');
  const expectedToken = process.env.METRICS_TOKEN;

  // If METRICS_TOKEN is set, require it. Otherwise allow (for local dev).
  if (expectedToken && token !== expectedToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const metrics = await registry.metrics();
  return new NextResponse(metrics, {
    headers: { 'Content-Type': registry.contentType },
  });
}
