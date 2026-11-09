import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Apex Planner',
    short_name: 'Apex',
    description: 'Unified daily personal OS — Google + Apple calendar sync, task management, and smart scheduling.',
    start_url: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#0F1117',
    theme_color: '#0F1117',
    categories: ['productivity', 'lifestyle'],
    icons: [
      {
        src: '/icon-192.svg',
        sizes: '192x192',
        type: 'image/svg+xml',
        purpose: 'any',
      },
      {
        src: '/icon-512.svg',
        sizes: '512x512',
        type: 'image/svg+xml',
        purpose: 'any',
      },
      {
        src: '/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'maskable',
      },
    ],
  };
}
