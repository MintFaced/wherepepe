'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

// ChatPepe nav link with a green dot when the signed-in wallet has unread @s.
export default function ChatNav() {
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      let token = null;
      try { token = localStorage.getItem('chatpepe:token'); } catch {}
      if (!token) { if (!cancelled) setUnread(0); return; }
      try {
        const res = await fetch(`/api/chat/notifications?token=${encodeURIComponent(token)}`);
        const d = await res.json();
        if (!cancelled) setUnread(d.ok ? (d.unread || 0) : 0);
      } catch {}
    };
    check();
    const iv = setInterval(check, 15000);
    const onFocus = () => check();
    window.addEventListener('focus', onFocus);
    return () => { cancelled = true; clearInterval(iv); window.removeEventListener('focus', onFocus); };
  }, []);

  return (
    <Link href="/chat" className="header-chatlink">
      ChatPepe
      {unread > 0 && <span className="notif-dot" title={`${unread} new mention${unread > 1 ? 's' : ''}`} />}
    </Link>
  );
}
