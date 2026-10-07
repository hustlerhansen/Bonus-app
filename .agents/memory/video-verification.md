---
name: Video verification
description: Keep film validation separate from preview-host behavior and iframe-only controls.
---

Verify the top-level film composition and the iframe preview as separate surfaces. Development-host warnings are not part of the film, but can change the visible viewport and pointer coordinates.

**Why:** Browser checks against the development domain encountered injected preview chrome, while the routed app screenshot did not. Treating their geometry as identical caused misleading control-test results.

**How to apply:** Inspect the actual frame bounds and keep controls fully visible before sending native pointer actions. Verify the recording lifecycle without iframe controls, then check pause, scene selection and audio in an iframe.
