'use client';

import { useState } from 'react';
import { useServerInsertedHTML } from 'next/navigation';
import createCache, { type EmotionCache } from '@emotion/cache';
import { CacheProvider } from '@emotion/react';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import rtlPlugin from 'stylis-plugin-rtl';
import { theme } from '@/theme/theme';

/**
 * Emotion + MUI registry that flushes server-generated styles into the SSR
 * HTML so the page paints styled on first byte. Without this, every route
 * boundary unmounts the cache, the server sends styleless HTML, and the
 * browser flashes a giant unstyled tree until React hydrates and emotion
 * injects styles client-side (the FOUC the user reported).
 *
 * Pattern from the official MUI App Router guide:
 *   https://mui.com/material-ui/integrations/nextjs/#nextjs-app-router
 */
export function RTLThemeProvider({ children }: { children: React.ReactNode }) {
  const [registry] = useState(() => {
    const cache: EmotionCache = createCache({
      key: 'muirtl',
      stylisPlugins: [rtlPlugin],
      prepend: true,
    });
    cache.compat = true;
    const prevInsert = cache.insert;
    let inserted: { name: string; isGlobal: boolean }[] = [];
    cache.insert = (...args) => {
      const [selector, serialized] = args;
      if (cache.inserted[serialized.name] === undefined) {
        inserted.push({ name: serialized.name, isGlobal: !selector });
      }
      return prevInsert(...args);
    };
    const flush = () => {
      const prev = inserted;
      inserted = [];
      return prev;
    };
    return { cache, flush };
  });

  useServerInsertedHTML(() => {
    const names = registry.flush();
    if (names.length === 0) return null;
    let bundled = '';
    const dataEmotionKey = registry.cache.key;
    const globals: { name: string; style: string }[] = [];
    for (const { name, isGlobal } of names) {
      const style = registry.cache.inserted[name];
      if (typeof style === 'string') {
        if (isGlobal) {
          globals.push({ name, style });
        } else {
          bundled += style;
        }
      }
    }
    return (
      <>
        {globals.map(({ name, style }) => (
          <style
            key={name}
            data-emotion={`${dataEmotionKey}-global ${name}`}
            dangerouslySetInnerHTML={{ __html: style }}
          />
        ))}
        {bundled && (
          <style
            data-emotion={`${dataEmotionKey} ${names
              .filter((n) => !n.isGlobal)
              .map((n) => n.name)
              .join(' ')}`}
            dangerouslySetInnerHTML={{ __html: bundled }}
          />
        )}
      </>
    );
  });

  return (
    <CacheProvider value={registry.cache}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </CacheProvider>
  );
}
