# Project workflow

## iOS development installations

For app changes, including small UI and copy changes, completion includes integration into `main` and refreshing the development installations below unless the user explicitly requests code-only work. Do not report an app change as complete after only editing files or running the web build.

After a successful merge into `main`, first verify the merged code and synchronize local `main` with `origin/main`. Then run:

```bash
npm run ios:refresh:devices
```

If the working directory contains unrelated changes, preserve them and use a separate clean checkout of the verified, synchronized `main` for the refresh. Keep the refresh preflight checks intact.

Report the simulator and physical iPhone results separately. An unavailable paired iPhone is non-blocking and must be reported as waiting for installation. A build, signing, installation, or launch failure on an available device is blocking and must not be reported as updated. This command updates local development installations only; it is not a production deployment.
