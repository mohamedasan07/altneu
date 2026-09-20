import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

async function checkTable() {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  console.log('Checking if contact_messages table exists...');
  // Note: we can't fully automate schema migrations from frontend-only context,
  // but we can at least ping the DB to see if it responds to queries on that table.

  const { data, error } = await supabase
    .from('contact_messages')
    .select('id')
    .limit(1);

  if (error) {
    if (error.code === '42P01') {
      console.error('ERROR: Table contact_messages does not exist.');
    } else {
      console.error('ERROR:', error.message);
    }
    process.exit(1);
  }

  console.log('SUCCESS: Table contact_messages exists!');
}

checkTable();
