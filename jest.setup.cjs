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

// Mock pg module for tests (avoid real database connections)
jest.mock('pg', () => {
  const mockPool = {
    connect: jest.fn().mockResolvedValue({
      query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
      release: jest.fn(),
    }),
    on: jest.fn(),
    query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
    end: jest.fn().mockResolvedValue(undefined),
  };

  return {
    Pool: jest.fn(() => mockPool),
    Client: jest.fn(),
  };
}, { virtual: true });

// Mock redis module for tests
jest.mock('redis', () => {
  const mockClient = {
    connect: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn().mockResolvedValue(undefined),
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    incr: jest.fn().mockResolvedValue(1),
    expire: jest.fn().mockResolvedValue(1),
    del: jest.fn().mockResolvedValue(0),
    keys: jest.fn().mockResolvedValue([]),
    lpush: jest.fn().mockResolvedValue(1),
    rpop: jest.fn().mockResolvedValue(null),
    llen: jest.fn().mockResolvedValue(0),
  };

  return {
    createClient: jest.fn(() => mockClient),
  };
}, { virtual: true });
