module.exports = {
  apps: [
    {
      name: "relay-bridge",
      cwd: "/Users/ruska/project/web-cli",
      script: "pnpm",
      args: "--filter local-bridge dev",
      env: {
        NODE_ENV: "development",
      },
      autorestart: true,
      watch: false,
      max_restarts: 20,
      restart_delay: 500,
    },
    {
      name: "relay-web",
      cwd: "/Users/ruska/project/web-cli",
      script: "pnpm",
      args: "--filter web dev",
      env: {
        NODE_ENV: "development",
      },
      autorestart: true,
      watch: false,
      max_restarts: 20,
      restart_delay: 500,
    },
  ],
};
