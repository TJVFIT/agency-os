import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Session refresh + route guard (Next 16 proxy, formerly middleware).
 * Public: /login, /approve/[token] (magic links, §10), /portal/[token]
 * (client portal, UPGRADE_SPEC §2), /api/* (webhooks and upload routes do
 * their own auth).
 */
export async function proxy(request: NextRequest) {
  // /preview is a credential-free UI demo route — skip the auth round-trip
  // entirely so it renders instantly even without a real Supabase backend.
  if (request.nextUrl.pathname.startsWith('/preview')) {
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Do not run code between createServerClient and auth.getUser() —
  // a skipped refresh can log users out randomly.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isPublic =
    path === '/login' ||
    path.startsWith('/approve') ||
    path.startsWith('/portal') ||
    path.startsWith('/api') ||
    // PWA assets (UPGRADE_SPEC §8): the browser fetches the manifest without
    // credentials and the SW file must never redirect to /login.
    path === '/manifest.webmanifest' ||
    path === '/sw.js';

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.search = '';
    return NextResponse.redirect(url);
  }

  if (user && path === '/login') {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    url.search = '';
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    // Everything except static assets and images.
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
