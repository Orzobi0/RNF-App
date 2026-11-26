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
  plugins: {
    SystemBars: { insetsHandling: 'css', initialViewportFitValueHint: 'cover', style: 'LIGHT' },
  },
  // Preserve Capacitor 5's origin and its Auth/IndexedDB/localStorage data.
  server: staging && androidMode === 'embedded' ? { androidScheme: 'http', hostname: 'localhost', cleartext: false } : {
    androidScheme: 'http',
    url: staging ? 'https://fertiliapp-staging.web.app' : 'https://rnf-app.web.app',
    cleartext: false
  }
};

export default config;
