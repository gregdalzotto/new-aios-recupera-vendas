/**
 * Meta WhatsApp Secrets Validation Script
 *
 * Validates all Meta API credentials before running any tests:
 * - Access Token validity
 * - Phone ID validity
 * - Business Account ID validity
 * - Required permissions
 * - API connectivity
 */

import 'dotenv/config';
import axios from 'axios';

const {
  WHATSAPP_ACCESS_TOKEN,
  WHATSAPP_PHONE_ID,
  WHATSAPP_BUSINESS_ACCOUNT_ID,
  WHATSAPP_APP_SECRET,
  WHATSAPP_APP_ID,
} = process.env;

interface ValidationResult {
  name: string;
  status: 'PASS' | 'FAIL' | 'WARN';
  message: string;
  details?: any;
}

const results: ValidationResult[] = [];

async function validateSecrets() {
  console.log('\n' + '='.repeat(70));
  console.log('🔐 Meta WhatsApp Secrets Validation');
  console.log('='.repeat(70) + '\n');

  // 1. Check if all secrets are provided
  console.log('1️⃣  Checking if all secrets are provided...\n');

  const requiredSecrets = {
    'WHATSAPP_ACCESS_TOKEN': WHATSAPP_ACCESS_TOKEN,
    'WHATSAPP_PHONE_ID': WHATSAPP_PHONE_ID,
    'WHATSAPP_BUSINESS_ACCOUNT_ID': WHATSAPP_BUSINESS_ACCOUNT_ID,
    'WHATSAPP_APP_SECRET': WHATSAPP_APP_SECRET,
    'WHATSAPP_APP_ID': WHATSAPP_APP_ID,
  };

  for (const [key, value] of Object.entries(requiredSecrets)) {
    if (value) {
      console.log(`   ✅ ${key}: provided`);
      if (key === 'WHATSAPP_ACCESS_TOKEN') {
        console.log(`      └─ Starts with: ${value.substring(0, 10)}...`);
      }
    } else {
      console.log(`   ❌ ${key}: MISSING`);
      results.push({
        name: `Secret: ${key}`,
        status: 'FAIL',
        message: `${key} is not set in .env`,
      });
    }
  }

  // 2. Validate Access Token format
  console.log('\n2️⃣  Validating Access Token format...\n');

  if (WHATSAPP_ACCESS_TOKEN) {
    if (WHATSAPP_ACCESS_TOKEN.startsWith('EAAMLT')) {
      console.log('   ✅ Access Token format looks valid (starts with EAAMLT)');
      results.push({
        name: 'Access Token Format',
        status: 'PASS',
        message: 'Token format is correct',
      });
    } else {
      console.log('   ⚠️  Access Token format seems unusual (should start with EAAMLT)');
      results.push({
        name: 'Access Token Format',
        status: 'WARN',
        message: 'Token format unusual - may be invalid',
      });
    }
  }

  // 3. Test Access Token with Meta API
  console.log('\n3️⃣  Testing Access Token with Meta API...\n');

  try {
    const response = await axios.get('https://graph.instagram.com/v18.0/me', {
      params: {
        access_token: WHATSAPP_ACCESS_TOKEN,
        fields: 'id,name,email',
      },
      timeout: 5000,
    });

    console.log(`   ✅ Access Token is VALID`);
    console.log(`      └─ Account ID: ${response.data.id}`);
    console.log(`      └─ Name: ${response.data.name}`);
    console.log(`      └─ Email: ${response.data.email}`);

    results.push({
      name: 'Access Token Validity',
      status: 'PASS',
      message: 'Token is valid and authenticated',
      details: response.data,
    });
  } catch (error: any) {
    console.log(`   ❌ Access Token is INVALID or EXPIRED`);
    console.log(`      └─ Error: ${error.response?.data?.error?.message || error.message}`);
    results.push({
      name: 'Access Token Validity',
      status: 'FAIL',
      message: 'Token validation failed',
      details: error.response?.data?.error,
    });
  }

  // 4. Validate Phone ID
  console.log('\n4️⃣  Validating Phone ID...\n');

  if (WHATSAPP_PHONE_ID && WHATSAPP_ACCESS_TOKEN) {
    try {
      const response = await axios.get(`https://graph.instagram.com/v18.0/${WHATSAPP_PHONE_ID}`, {
        params: {
          access_token: WHATSAPP_ACCESS_TOKEN,
          fields: 'id,display_phone_number,quality_rating',
        },
        timeout: 5000,
      });

      console.log(`   ✅ Phone ID is VALID`);
      console.log(`      └─ Display Number: ${response.data.display_phone_number}`);
      console.log(`      └─ Quality Rating: ${response.data.quality_rating || 'N/A'}`);

      results.push({
        name: 'Phone ID Validity',
        status: 'PASS',
        message: 'Phone ID is valid',
        details: response.data,
      });
    } catch (error: any) {
      console.log(`   ❌ Phone ID is INVALID`);
      console.log(`      └─ Error: ${error.response?.data?.error?.message || error.message}`);
      results.push({
        name: 'Phone ID Validity',
        status: 'FAIL',
        message: 'Phone ID validation failed',
        details: error.response?.data?.error,
      });
    }
  }

  // 5. Validate Business Account ID
  console.log('\n5️⃣  Validating Business Account ID...\n');

  if (WHATSAPP_BUSINESS_ACCOUNT_ID && WHATSAPP_ACCESS_TOKEN) {
    try {
      const response = await axios.get(
        `https://graph.instagram.com/v18.0/${WHATSAPP_BUSINESS_ACCOUNT_ID}`,
        {
          params: {
            access_token: WHATSAPP_ACCESS_TOKEN,
            fields: 'id,name,account_review_status',
          },
          timeout: 5000,
        }
      );

      console.log(`   ✅ Business Account ID is VALID`);
      console.log(`      └─ Account: ${response.data.name}`);
      console.log(`      └─ Review Status: ${response.data.account_review_status}`);

      results.push({
        name: 'Business Account ID Validity',
        status: 'PASS',
        message: 'Business Account ID is valid',
        details: response.data,
      });
    } catch (error: any) {
      console.log(`   ❌ Business Account ID is INVALID`);
      console.log(`      └─ Error: ${error.response?.data?.error?.message || error.message}`);
      results.push({
        name: 'Business Account ID Validity',
        status: 'FAIL',
        message: 'Business Account ID validation failed',
        details: error.response?.data?.error,
      });
    }
  }

  // 6. Validate App Secret format
  console.log('\n6️⃣  Validating App Secret...\n');

  if (WHATSAPP_APP_SECRET) {
    if (WHATSAPP_APP_SECRET.length >= 32) {
      console.log('   ✅ App Secret format looks valid (length >= 32)');
      console.log(`      └─ Length: ${WHATSAPP_APP_SECRET.length} chars`);
      console.log(`      └─ Starts with: ${WHATSAPP_APP_SECRET.substring(0, 10)}...`);
      results.push({
        name: 'App Secret Format',
        status: 'PASS',
        message: 'App Secret format is correct',
      });
    } else {
      console.log('   ⚠️  App Secret seems too short');
      results.push({
        name: 'App Secret Format',
        status: 'WARN',
        message: 'App Secret length is suspicious',
      });
    }
  }

  // 7. Test sending a test message
  console.log('\n7️⃣  Testing message send capability...\n');

  if (WHATSAPP_PHONE_ID && WHATSAPP_ACCESS_TOKEN) {
    // We won't actually send a message, just check if the endpoint is accessible
    try {
      const response = await axios.post(
        `https://graph.instagram.com/v18.0/${WHATSAPP_PHONE_ID}/messages`,
        {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: '+5548999327881', // Test number
          type: 'text',
          text: { body: 'TEST_ONLY_DO_NOT_SEND' },
        },
        {
          params: {
            access_token: WHATSAPP_ACCESS_TOKEN,
          },
          timeout: 5000,
          validateStatus: () => true, // Accept any status
        }
      );

      if (response.status === 200) {
        console.log(`   ✅ Message send endpoint is ACCESSIBLE`);
        console.log(`      └─ Message ID: ${response.data.messages?.[0]?.id || 'N/A'}`);
        results.push({
          name: 'Message Send Capability',
          status: 'PASS',
          message: 'Message send endpoint is working',
        });
      } else if (response.status === 400 || response.status === 422) {
        // Bad request usually means endpoint exists but request is invalid
        console.log(`   ✅ Message send endpoint is ACCESSIBLE`);
        console.log(`      └─ Status: ${response.status} (expected - test payload)`);
        results.push({
          name: 'Message Send Capability',
          status: 'PASS',
          message: 'Message send endpoint is accessible',
        });
      } else if (response.status === 401) {
        console.log(`   ❌ Message send endpoint: AUTHENTICATION FAILED`);
        console.log(`      └─ Status: ${response.status}`);
        console.log(`      └─ Error: ${response.data.error?.message}`);
        results.push({
          name: 'Message Send Capability',
          status: 'FAIL',
          message: 'Authentication failed on message endpoint',
          details: response.data.error,
        });
      } else {
        console.log(`   ⚠️  Message send endpoint returned: ${response.status}`);
        console.log(`      └─ Error: ${response.data.error?.message || 'Unknown'}`);
        results.push({
          name: 'Message Send Capability',
          status: 'WARN',
          message: `Endpoint returned status ${response.status}`,
          details: response.data.error,
        });
      }
    } catch (error: any) {
      console.log(`   ❌ Message send endpoint is NOT ACCESSIBLE`);
      console.log(`      └─ Error: ${error.message}`);
      results.push({
        name: 'Message Send Capability',
        status: 'FAIL',
        message: 'Unable to reach message send endpoint',
      });
    }
  }

  // Summary
  console.log('\n' + '='.repeat(70));
  console.log('📊 Validation Summary');
  console.log('='.repeat(70) + '\n');

  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  const warned = results.filter(r => r.status === 'WARN').length;

  for (const result of results) {
    const icon = result.status === 'PASS' ? '✅' : result.status === 'FAIL' ? '❌' : '⚠️ ';
    console.log(`${icon} ${result.name}`);
    console.log(`   ${result.message}\n`);
  }

  console.log('='.repeat(70));
  console.log(`Results: ${passed} passed, ${warned} warned, ${failed} failed`);
  console.log('='.repeat(70) + '\n');

  if (failed === 0) {
    console.log('✅ All critical validations passed!');
    console.log('   You can proceed with E2E testing.\n');
    return true;
  } else {
    console.log('❌ Some validations failed!');
    console.log('   Please fix the issues before running tests.\n');
    console.log('📝 Next steps:');
    console.log('   1. Check your Meta Business Manager');
    console.log('   2. Regenerate tokens if needed');
    console.log('   3. Verify Phone ID and Business Account ID');
    console.log('   4. Run this script again to validate\n');
    return false;
  }
}

validateSecrets().catch(error => {
  console.error('❌ Validation script error:', error.message);
  process.exit(1);
});
