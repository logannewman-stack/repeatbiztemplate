#!/usr/bin/env node
/**
 * ============================================================================
 * VAPID KEY GENERATION
 * ============================================================================
 *     npm run vapid
 *
 * Generates the keypair that identifies this app to push services. Run once
 * per client deployment and paste the output into the environment.
 *
 * The public key is safe to expose — the browser needs it to subscribe, which
 * is why it is duplicated as NEXT_PUBLIC_. The private key signs the requests
 * that authorise sending and must stay server-side.
 *
 * Rotating these invalidates every existing subscription: browsers subscribed
 * under the old public key cannot be reached with the new private one. So
 * generate once and keep them, or expect every client to re-enable
 * notifications after a rotation.
 * ============================================================================
 */

import webpush from 'web-push';

const { publicKey, privateKey } = webpush.generateVAPIDKeys();

console.log(`
Add these to .env.local, and to the Vercel project's environment variables:

VAPID_PUBLIC_KEY=${publicKey}
VAPID_PRIVATE_KEY=${privateKey}
NEXT_PUBLIC_VAPID_PUBLIC_KEY=${publicKey}
VAPID_SUBJECT=mailto:you@yourbusiness.com

NEXT_PUBLIC_VAPID_PUBLIC_KEY is the same value as VAPID_PUBLIC_KEY. It is
duplicated because the browser needs it at subscribe time and only
NEXT_PUBLIC_ variables reach the client.

Keep VAPID_PRIVATE_KEY server-side. Rotating the pair unsubscribes everyone.
`);
