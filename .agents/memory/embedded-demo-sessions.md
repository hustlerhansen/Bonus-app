---
name: Embedded demo sessions
description: Why BONUSPLAY's demo cookie policy differs from a conventional top-level-only session.
---

Use HTTPS-compatible partitioned session cookies for the embedded Preview; retain HttpOnly signing and cross-site mutation rejection. Local HTTP development uses a same-site cookie policy instead.

**Why:** A conventional strict same-site cookie can be unavailable when the app runs inside a cross-site Preview iframe, making a successful demo login look as though it did not persist.

**How to apply:** Preserve embedded Preview compatibility when modifying demo sessions. Do not change the cookie policy to a top-level-only policy without checking the embedded login flow. Managed authentication for real users should use its own documented Preview-compatible setup.
