import type { UserConfig, ConfigEnv } from 'vite';
import cesium from 'vite-plugin-cesium';
import { defineConfig, loadEnv } from 'vite';
import { resolve } from 'node:path';
import {
  createBuildOptions,
  createCSSOptions,
  createDefineOptions,
  createEsBuildOptions,
  createServerOptions,
  createVitePlugins,
  wrapperEnv,
} from './build';

export default defineConfig(async ({ command, mode }: ConfigEnv) => {
  const root = process.cwd();
  const isBuild = command === 'build';
  const env = loadEnv(mode, root);
  const viteEnv = wrapperEnv(env);
  const cameraStreamProxyTarget = env.VITE_CAMERA_STREAM_PROXY_TARGET || 'http://127.0.0.1:8888';
  const wvpStreamProxyTarget = env.VITE_WVP_STREAM_PROXY_TARGET || 'http://127.0.0.1';
  const rewriteWvpStreamPath = (path: string) => {
    const [pathname, query = ''] = path.split('?', 2);
    const searchParams = new URLSearchParams(query);
    searchParams.delete('cookieCheck');
    const rewrittenPath = pathname.replace(/^\/video-stream/, '');
    const rewrittenQuery = searchParams.toString();
    return rewrittenQuery ? `${rewrittenPath}?${rewrittenQuery}` : rewrittenPath;
  };
  const pathResolve = (pathname: string) => resolve(root, '.', pathname);
  const config: UserConfig = {
    root,
    base: viteEnv.VITE_PUBLIC_PATH,
    define: await createDefineOptions(),
    plugins: [createVitePlugins(isBuild, viteEnv), cesium()],
    server: {
      proxy: {
        // HTTP API
        '/api': {
          target: 'http://localhost:8080',
          changeOrigin: true,
        },

        // ✅ WebSocket：同源转发到 TB 后端
        '/api/ws': {
          target: 'ws://localhost:8080',
          ws: true,
          changeOrigin: true,
        },

        // WVP/ZLMediaKit HLS output. Keep this separate from the legacy
        // MediaMTX /live proxy so the existing fallback remains available.
        '/video-stream': {
          target: wvpStreamProxyTarget,
          changeOrigin: true,
          secure: false,
          rewrite: rewriteWvpStreamPath,
        },

        // Proxy the MediaMTX built-in preview page through HTTPS so the map popup
        // can reuse the stable local player without browser mixed-content issues.
        '/live-view': {
          target: cameraStreamProxyTarget,
          changeOrigin: true,
          secure: false,
          rewrite: (path) => path.replace(/^\/live-view/, ''),
        },

        // Local camera stream proxy. Keep this after /live-view so preview-page
        // requests are not accidentally rewritten from /live-view/... to /-view/...
        '^/live(?:/.*)?$': {
          target: cameraStreamProxyTarget,
          changeOrigin: true,
          secure: false,
          rewrite: (path) => path.replace(/^\/live/, ''),
        },

        // Some HLS loaders resolve playlist requests as /{cameraCode}/... instead of /live/{cameraCode}/...
        // Proxy these top-level local camera paths to MediaMTX as well to keep local HTTPS playback stable.
        '^/(?:virtual|sim)-.*': {
          target: cameraStreamProxyTarget,
          changeOrigin: true,
          secure: false,
        },
      },
    },
    esbuild: createEsBuildOptions(mode),
    build: createBuildOptions(viteEnv),
    css: createCSSOptions(),
    resolve: {
      alias: {
        '/@/': pathResolve('src') + '/',
        '/#/': pathResolve('types') + '/',
      },
    },
  };
  return config;
});
