'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

// ChatPepe nav link: a pulsating green dot when you've been @tagged, and a
// count of new posts since your last visit (with a small popover).
export default function ChatNav() {
  const [unread, setUnread] = useState(0);
  const [newPosts, setNewPosts] = useState(0);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      let token = null;
      try { token = localStorage.getItem('chatpepe:token'); } catch {}
      if (!token) { if (!cancelled) { setUnread(0); setNewPosts(0); } return; }
      try {
        const res = await fetch(`/api/chat/notifications?token=${encodeURIComponent(token)}`);
        const d = await res.json();
        if (!cancelled) { setUnread(d.ok ? (d.unread || 0) : 0); setNewPosts(d.ok ? (d.newPosts || 0) : 0); }
      } catch {}
    };
    check();
    const iv = setInterval(check, 15000);
    const onFocus = () => check();
    window.addEventListener('focus', onFocus);
    return () => { cancelled = true; clearInterval(iv); window.removeEventListener('focus', onFocus); };
  }, []);

  const hasNews = unread > 0 || newPosts > 0;

  return (
    <span
      className="header-chatlink"
      onMouseEnter={() => hasNews && setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <Link href="/chat">
        ChatPepe
        {newPosts > 0 && <span className="notif-count">{newPosts > 99 ? '99+' : newPosts}</span>}
        {unread > 0 && <span className="notif-dot pulse" aria-label="You've been tagged" />}
      </Link>
      {open && (
        <div className="notif-pop">
          {unread > 0 && (
            <div className="notif-pop-row">
              <span className="notif-dot pulse" /> You’ve been tagged{unread > 1 ? ` ×${unread}` : ''}
            </div>
          )}
          <div className="notif-pop-box">{newPosts.toLocaleString()} new post{newPosts === 1 ? '' : 's'} since your last visit</div>
        </div>
      )}
    </span>
  );
}
