'use client';

import { useSyncExternalStore } from 'react';
import { useReducedMotion as useMotionPreference } from 'motion/react';

const subscribe = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

// Match the server during hydration, then apply the browser's motion preference.
export function useReducedMotion() {
  const mounted = useSyncExternalStore(
    subscribe,
    clientSnapshot,
    serverSnapshot,
  );
  const preference = useMotionPreference();
  return mounted && Boolean(preference);
}
