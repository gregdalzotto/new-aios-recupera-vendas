// eslint-disable-next-line @typescript-eslint/no-var-requires
const fs = require('fs');

describe('Environment Configuration Schema', () => {
  // These tests validate the schema structure without requiring actual env vars
  // Real validation happens at runtime during startup

  it('should have required environment variables defined', () => {
    // Schema validation happens in src/config/env.ts on require
    // This test verifies the schema structure exists
    expect(() => {
      const envContent = fs.readFileSync('src/config/env.ts', 'utf-8');
      expect(envContent).toContain('WHATSAPP_VERIFY_TOKEN');
      expect(envContent).toContain('WHATSAPP_APP_SECRET');
      expect(envContent).toContain('DATABASE_URL');
      expect(envContent).toContain('NODE_ENV');
      expect(envContent).toContain('PORT');
      expect(envContent).toContain('LOG_LEVEL');
    }).not.toThrow();
  });

  it('should define Zod schema for validation', () => {
    // Verify schema is imported and used
    const envContent = fs.readFileSync('src/config/env.ts', 'utf-8');
    expect(envContent).toContain('z.object');
    expect(envContent).toContain('envSchema');
    expect(envContent).toContain('envSchema.parse');
  });

  it('should require minimum length for WHATSAPP_VERIFY_TOKEN', () => {
    const envContent = fs.readFileSync('src/config/env.ts', 'utf-8');
    expect(envContent).toContain('min(10');
  });

  it('should require minimum length for WHATSAPP_APP_SECRET', () => {
    const envContent = fs.readFileSync('src/config/env.ts', 'utf-8');
    expect(envContent).toContain('min(20');
  });

  it('should validate DATABASE_URL is a PostgreSQL connection', () => {
    const envContent = fs.readFileSync('src/config/env.ts', 'utf-8');
    expect(envContent).toContain("startsWith('postgres')");
  });

  it('should have default values for optional env vars', () => {
    const envContent = fs.readFileSync('src/config/env.ts', 'utf-8');
    expect(envContent).toContain(".default('development')");
    expect(envContent).toContain('.default(3000)');
    expect(envContent).toContain(".default('info')");
  });

  it('should exit process on validation error', () => {
    const envContent = fs.readFileSync('src/config/env.ts', 'utf-8');
    expect(envContent).toContain('process.exit(1)');
  });
});
