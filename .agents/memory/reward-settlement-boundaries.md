---
name: Reward settlement boundaries
description: Why manual fulfillment and ambiguous delivery must not trigger automatic retry/refund.
---

Until a real supplier protocol is approved, fulfillment is manual and uses the order identity as the external delivery reference. Unknown delivery outcomes retain the debit and inventory allocation until an operator verifies delivery or non-delivery; never refund or resend just because a supplier call timed out.

**Why:** Without an approved supplier protocol, automatic refunds/retries could deliver a reward twice or refund an already delivered reward. The assignment forbids invented suppliers and demo providers.

**How to apply:** Keep security/commercial activation separate from feature delivery. Use actual contract-approved reward definitions only, test commercial writes in isolated schemas, and require traceable operator evidence before terminal settlement.

Refund/release must remain possible when a recipient is suspended after ordering or activation is later closed, without granting broader authority to user/admin point mutations.

**Why:** Suspending an account or closing commerce must not strand its already-reserved financial liability.

**How to apply:** Preserve narrow internal, administrator-authorized settlement paths; new redemption/dispatch continues to enforce active-account, risk and commercial gates.
