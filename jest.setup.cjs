// Load .env.test for test environment
// eslint-disable-next-line @typescript-eslint/no-var-requires
const fs = require('fs');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const path = require('path');

const envTestPath = path.join(__dirname, '.env.test');

if (fs.existsSync(envTestPath)) {
  const envContent = fs.readFileSync(envTestPath, 'utf-8');
  const lines = envContent.split('\n');

  for (const line of lines) {
    if (line.startsWith('#') || !line.trim()) {
      continue;
    }

    const [key, ...valueParts] = line.split('=');
    const value = valueParts.join('=');

    process.env[key.trim()] = value.trim();
  }
}
