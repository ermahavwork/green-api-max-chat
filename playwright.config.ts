import {defineConfig} from '@playwright/test';
export default defineConfig({
  testDir:'./tests/e2e',fullyParallel:false,workers:1,timeout:30000,
  use:{baseURL:'http://127.0.0.1:4178',headless:true,viewport:{width:1440,height:960},
    launchOptions:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{}},
  webServer:{command:'npm run dev -- --port 4178 --strictPort',url:'http://127.0.0.1:4178',reuseExistingServer:!process.env.CI},
});
