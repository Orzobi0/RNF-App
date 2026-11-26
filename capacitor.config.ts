import type { CapacitorConfig } from '@capacitor/cli';

const environment = process.env.CAPACITOR_ENV || 'staging';
if (!['staging', 'production'].includes(environment)) {
  throw new Error('CAPACITOR_ENV must be staging or production');
}
const staging = environment === 'staging';
const androidMode = process.env.CAPACITOR_STAGING_MODE || 'remote';
if (!['remote', 'embedded'].includes(androidMode) || (!staging && androidMode !== 'remote')) {
  throw new Error('CAPACITOR_STAGING_MODE must be remote or embedded (Staging only)');
}

const config: CapacitorConfig = {
  appId: staging ? 'com.fertiliapp.fertiliapp.staging' : 'com.fertiliapp.fertiliapp',
  appName: staging ? 'FertiliApp Staging' : 'FertiliApp',
  webDir: staging ? 'dist-staging' : 'dist',
  server: staging && androidMode === 'embedded' ? { cleartext: false } : {
    url: staging ? 'https://fertiliapp-staging.web.app' : 'https://rnf-app.web.app',
    cleartext: false
  }
};

export default config;
