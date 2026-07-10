'use server';

import { redirect } from 'next/navigation';

/** Demo shell "logout" — just leaves the walkthrough. */
export async function demoLogout() {
  redirect('/login');
}
