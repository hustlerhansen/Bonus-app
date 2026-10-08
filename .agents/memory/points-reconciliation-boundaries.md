---
name: Points reconciliation boundaries
description: Operational reconciliation is a detector, not a financial repair or identity export mechanism.
---

Keep operational points reconciliation strictly read-only. Return actionable technical transaction/event references and hashed account references, not identity IDs, free text or provider/request identifiers. Never turn detection into automatic financial correction or history rewriting.

**Why:** The user explicitly requested periodic detection and operator review without modifying economic history or exposing personal data/secrets in logs.

**How to apply:** Extend checks against the same consistent financial snapshot. New corrections must remain separately approved and audited through the financial engine. Treat scan failure or a stopped scheduler as monitoring failure, never as a clean ledger.
