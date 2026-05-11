// PM2-конфиг для запуска gogachess на VPS без Docker.
// Запуск: pm2 start ecosystem.config.cjs --env production
// Перезапуск после деплоя: pm2 reload gogachess

module.exports = {
  apps: [
    {
      name: 'gogachess',
      script: 'node_modules/tsx/dist/cli.mjs',
      args: 'server/index.ts',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
    },
  ],
};
