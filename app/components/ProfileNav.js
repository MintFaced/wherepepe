'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

function addressFromToken(token) {
  try {
    let b = token.split('.')[0].replace(/-/g, '+').replace(/_/g, '/');
    while (b.length % 4) b += '=';
    return JSON.parse(atob(b)).a || null;
  } catch {
    return null;
  }
}

// Links to the viewer's own profile once signed in, else to onboarding.
export default function ProfileNav() {
  const [href, setHref] = useState('/onboarding');

  useEffect(() => {
    const resolve = () => {
      try {
        const t = localStorage.getItem('chatpepe:token');
        const a = t && addressFromToken(t);
        setHref(a ? `/u/${a}` : '/onboarding');
      } catch {
        setHref('/onboarding');
      }
    };
    resolve();
    window.addEventListener('focus', resolve);
    window.addEventListener('storage', resolve);
    return () => { window.removeEventListener('focus', resolve); window.removeEventListener('storage', resolve); };
  }, []);

  return <Link href={href}>Profile</Link>;
}
