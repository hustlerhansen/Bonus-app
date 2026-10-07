---
name: OpenAPI Zod export collisions
description: Orval can generate colliding validator and TypeScript query names for operations with both path and query parameters.
---

When an operation has both path parameters and query parameters, Orval can give a runtime path validator and a generated query type the same exported name. Disambiguate the library barrel with an explicit runtime-validator export, rather than hand-editing generated files or dropping all generated types.

**Why:** The generator succeeds but the chained TypeScript build then rejects the two wildcard exports. This is a generator naming collision, not an invalid API contract.

**How to apply:** If required codegen reports a duplicate export for a Params name, inspect the generated path validator and query type. Keep the server's runtime validator accessible and use the client library for frontend query types. Regenerate normally after every contract change.
