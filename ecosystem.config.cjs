/**
 * PM2 process map for production VPS.
 *
 * Web UI is NOT served by shopiq-api. After UI changes you must:
 *   npm run build:web
 *   pm2 restart shopiq-web
 *
 * Nginx should proxy shopiq.me -> http://127.0.0.1:4173
 */
module.exports = {
  apps: [
    {
      name: "shopiq-api",
      cwd: "./apps/api",
      script: "src/server.js",
      interpreter: "node",
      instances: 1,
      autorestart: true,
      max_restarts: 20,
      env: {
        NODE_ENV: "production",
      },
    },
    {
      name: "shopiq-web",
      cwd: "./apps/web",
      script: "npm",
      args: "run preview",
      interpreter: "none",
      autorestart: true,
      max_restarts: 20,
    },
  ],
};
