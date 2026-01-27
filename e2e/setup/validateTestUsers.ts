/**
 * 🧪 E2E Test Users Setup Script
 * 
 * This script validates that all required test users exist in the database.
 * Run this before E2E tests to ensure the test environment is properly configured.
 * 
 * USAGE:
 *   npx ts-node e2e/setup/validateTestUsers.ts
 * 
 * OR in Playwright config:
 *   globalSetup: './e2e/setup/validateTestUsers.ts'
 */

import { createClient } from '@supabase/supabase-js';
import { TEST_USERS, getAllTestUsers } from '../fixtures/users.seed';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || '';

interface ValidationResult {
  email: string;
  role: string;
  exists: boolean;
  canLogin: boolean;
  error?: string;
}

async function validateTestUsers(): Promise<void> {
  console.log('🧪 Validating E2E test users...\n');
  
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error('❌ Missing Supabase credentials. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY');
    process.exit(1);
  }
  
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
  
  const users = getAllTestUsers();
  const results: ValidationResult[] = [];
  
  for (const user of users) {
    const result: ValidationResult = {
      email: user.email,
      role: user.role,
      exists: false,
      canLogin: false,
    };
    
    try {
      // Try to sign in
      const { data, error } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: user.password,
      });
      
      if (error) {
        result.error = error.message;
        
        if (error.message.includes('Invalid login credentials')) {
          result.exists = true; // User exists but wrong password
          result.error = 'Wrong password configured';
        }
      } else if (data.session) {
        result.exists = true;
        result.canLogin = true;
        
        // Sign out to clean up
        await supabase.auth.signOut();
      }
    } catch (err) {
      result.error = err instanceof Error ? err.message : 'Unknown error';
    }
    
    results.push(result);
    
    // Log result
    const status = result.canLogin 
      ? '✅' 
      : result.exists 
        ? '⚠️ ' 
        : '❌';
    
    console.log(`${status} ${user.role}: ${user.email}`);
    if (result.error) {
      console.log(`   └─ ${result.error}`);
    }
  }
  
  // Summary
  console.log('\n📊 Summary:');
  const successful = results.filter(r => r.canLogin).length;
  const total = results.length;
  
  console.log(`   ${successful}/${total} users can login`);
  
  if (successful < total) {
    console.log('\n⚠️  Some test users are missing or misconfigured.');
    console.log('   Please create them in your test database:\n');
    
    for (const result of results.filter(r => !r.canLogin)) {
      console.log(`   CREATE USER: ${result.email}`);
      console.log(`   ROLE: ${result.role}`);
      console.log(`   PASSWORD: (use Test123! for test env)`);
      console.log('');
    }
  } else {
    console.log('\n✅ All test users are ready!');
  }
}

// Export for use in globalSetup
export default validateTestUsers;

// Run directly if called as script
if (require.main === module) {
  validateTestUsers().catch(console.error);
}
