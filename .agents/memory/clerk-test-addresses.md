---
name: Synthetic Clerk test addresses
description: The approved browser-login helper requires a provider-valid synthetic email domain.
---

For synthetic browser test identities, use a unique address at the reserved `example.com` domain rather than `.invalid`. Do not send email or substitute a real person's address.

**Why:** The approved Clerk test-login helper rejected `.invalid` addresses as invalid before it could establish a test session; the reserved `.com` domain was accepted.

**How to apply:** Specify an accepted reserved domain when briefing a protected browser test, so setup does not block before the actual application journey.
