'use server';

import { redirect } from 'next/navigation';

import { createSupabaseServer } from '@/lib/supabase/server';

export async function loginAction(formData: FormData) {
  const email = String(formData.get('email') ?? '');
  const password = String(formData.get('password') ?? '');

  const supabase = await createSupabaseServer();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) redirect('/login?error=1');
  redirect('/dashboard');
}

export async function logoutAction() {
  const supabase = await createSupabaseServer();
  await supabase.auth.signOut();
  redirect('/login');
}
