import { getSupabase } from '../database/client.js';

/**
 * Health payload — liveness probe. Checks server and database connectivity.
 */
export async function getHealth() {
  let dbStatus = 'ok';
  const supabase = getSupabase();
  if (supabase) {
    try {
      // Lightweight query to check if we can reach Supabase
      await supabase.from('products').select('id', { count: 'exact', head: true }).limit(1);
    } catch (err) {
      dbStatus = 'disconnected';
    }
  } else {
    dbStatus = 'unconfigured';
  }

  return { status: 'ok', database: dbStatus };
}