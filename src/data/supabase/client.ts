import { createClient } from '@supabase/supabase-js';
import { publicEnv } from '../../lib/env';
import type { Database } from './database.types';

export const supabase = createClient<Database>(
  publicEnv.supabaseUrl,
  publicEnv.supabasePublishableKey,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  },
);
