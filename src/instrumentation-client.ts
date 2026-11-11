import { z } from 'zod';

// Keep client validation compatible with a CSP that forbids JavaScript eval.
// Zod's interpreted parser preserves the same schemas and rejection rules.
z.config({ jitless: true });
