module.exports = {
  apps: [
    {
      name: 'ai-code-studio-backend',
      script: './dist/index.js',
      cwd: '/root/devcoding/apps/backend',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '2G',
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
      },
      error_file: '/var/log/pm2/ai-code-studio-error.log',
      out_file: '/var/log/pm2/ai-code-studio-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    },
  ],
};
