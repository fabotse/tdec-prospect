import { type NextRequest, NextResponse } from 'next/server'

export async function middleware(request: NextRequest) {
  // Placeholder middleware - will be configured in Story 1.5 (Authentication)
  // This will handle:
  // - Supabase auth session refresh
  // - Protected route access control
  // - Redirect unauthenticated users to login

  return NextResponse.next()
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
