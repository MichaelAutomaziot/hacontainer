import createCache from '@emotion/cache';
import rtlPlugin from 'stylis-plugin-rtl';

// Create RTL cache for emotion
export const cacheRtl = createCache({
  key: 'muirtl',
  stylisPlugins: [rtlPlugin],
  prepend: true,
});

// Create LTR cache (for mixed content or switching)
export const cacheLtr = createCache({
  key: 'muiltr',
  prepend: true,
});
