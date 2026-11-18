---
"@idcr/web": patch
---

Cap the MongoDB connection pool (10 per instance) and release idle connections after 60s.
