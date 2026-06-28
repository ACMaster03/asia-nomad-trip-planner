import type { NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/proxy'

// Next 16: this file replaces middleware.ts (it runs on the Node.js runtime).
export async function proxy(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
