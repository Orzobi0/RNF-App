import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.fertiliapp.fertiliapp',
  appName: 'FertiliApp',
  webDir: 'dist',
  server: {
    url: 'https://rnf-app-experiment.web.app',
    cleartext: false
  }
};

export default config;
