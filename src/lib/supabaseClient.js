
    import { createClient } from '@supabase/supabase-js';

    const supabaseUrl = 'https://ngxuanwbwmcaoftzissl.supabase.co';
    const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5neHVhbndid21jYW9mdHppc3NsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDc3NDI2MTksImV4cCI6MjA2MzMxODYxOX0.mYKHeOLU4mlQa6w5KIyIWzvhnfPPwWgn9hYvqldwmBw';

    export const supabase = createClient(supabaseUrl, supabaseAnonKey);
  