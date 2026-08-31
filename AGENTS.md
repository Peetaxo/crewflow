# Project workflow

## iOS development installations

After a successful merge into `main`, first verify the merged code and synchronize local `main` with `origin/main`. Then run:

```bash
npm run ios:refresh:devices
```

Report the simulator and physical iPhone results separately. An unavailable paired iPhone is non-blocking and must be reported as waiting for installation. A build, signing, installation, or launch failure on an available device is blocking and must not be reported as updated. This command updates local development installations only; it is not a production deployment.
