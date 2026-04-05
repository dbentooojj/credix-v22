module.exports = {
  apps: [
    {
      name: 'credix-frontend',
      script: 'npm',
      args: 'run start',
      cwd: '/home/user/webapp/frontend',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
        LEGACY_BACKEND_URL: 'http://localhost:4000',
        NEXT_TELEMETRY_DISABLED: '1',
      },
      watch: false,
      instances: 1,
      exec_mode: 'fork',
    }
  ]
}
