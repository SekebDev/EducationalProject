'use client';

import { useEffect, useState } from 'react';

const preferenceKey = 'caderno-sidebar-collapsed';

export function useSidebarPreference() {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(preferenceKey) === 'true');
    } catch {
      // The menu still works when the browser blocks preference storage.
    }
    function sync(event: StorageEvent) {
      if (event.key === preferenceKey) {
        setCollapsed(event.newValue === 'true');
      }
    }
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);

  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    try {
      localStorage.setItem(preferenceKey, String(next));
    } catch {
      // Keep the current visit's preference even without browser storage.
    }
  }

  return { collapsed, toggle };
}
