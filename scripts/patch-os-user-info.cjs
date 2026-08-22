// eslint-disable-next-line @typescript-eslint/no-require-imports -- Node preload must be CommonJS so child processes inherit the fallback.
const os = require("node:os");

try {
  os.userInfo();
} catch {
  os.userInfo = () => ({
    uid: -1,
    gid: -1,
    username: process.env.USERNAME || "local-user",
    homedir: process.env.USERPROFILE || process.cwd(),
    shell: null
  });
}
