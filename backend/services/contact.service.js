import { getSupabase } from '../database/client.js';

export async function createContactMessage(data) {
  const supabase = getSupabase();
  if (!supabase) throw new Error('Supabase is not configured');

  const { data: result, error } = await supabase
    .from('contact_messages')
    .insert([data])
    .select()
    .single();

  if (error) {
    throw error;
  }
  return result;
}
