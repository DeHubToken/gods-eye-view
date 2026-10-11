import { defineConfig } from 'vite';
import { createBrowserViteConfig } from './build/vite.js';

// The arcade is a static, sandboxed build. Keep upstream's local server separate.
export default defineConfig(() => ({
  ...createBrowserViteConfig({ command: 'build' }),
  base: '/gods-eye-game/',
  plugins: [
    ...createBrowserViteConfig({ command: 'build' }).plugins,
    {
      name: 'dehub-arcade',
      enforce: 'pre',
      transform(code, id) {
        if (id.endsWith('/src/main.js')) {
          return `import { installCommunityMap } from './standalone/dehubCommunity.js';\n${code}`
            .replace('application.start().catch(', 'application.start().then(({ scene }) => installCommunityMap(scene.viewer)).catch(');
        }
        if (id.endsWith('/src/app/viewer.js')) {
          return code.replace('baseLayer: false,', 'baseLayer: false, skyBox: false,');
        }
        // This dataset has a non-commercial licence; do not distribute it in the arcade.
        if (id.endsWith('/src/data/bhoteKoshiFloodPath.js')) {
          return 'export const BHOTE_KOSHI_FLOOD_PATH = Object.freeze([]);';
        }
      },
    },
  ],
}));
