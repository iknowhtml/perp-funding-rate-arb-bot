# Plan Management Examples

## Example 1: Creating a New Plan

### User Request
"Create a plan for implementing user authentication"

### Correct Response

1. **Read the template**:
   ```bash
   cat .cursor/plans/PLAN_TEMPLATE.md
   ```

2. **Create the plan file** with proper frontmatter:

```yaml
---
name: User Authentication
overview: Implement JWT-based user authentication with login, logout, and session management.
todos:
  - id: setup-auth-schema
    content: Create database schema for users and sessions
    status: pending
  - id: implement-jwt
    content: Implement JWT token generation and validation
    status: pending
  - id: create-login-endpoint
    content: Create login API endpoint with validation
    status: pending
  - id: create-logout-endpoint
    content: Create logout API endpoint
    status: pending
  - id: add-middleware
    content: Add authentication middleware for protected routes
    status: pending
  - id: write-tests
    content: Write unit and integration tests for auth flow
    status: pending
  - id: lifecycle-management
    content: Move plan to implemented/ directory after completion
    status: pending
isProject: false
---

# User Authentication

## Overview

Implement JWT-based user authentication...

## Tasks

### 1. Database Schema
...

### 2. JWT Implementation
...

(etc.)

## Validation

- [ ] All endpoints tested
- [ ] JWT tokens properly validated
- [ ] Session management working
- [ ] Tests passing
```

---

## Example 2: Implementing a Plan

### User Request
"Implement `.cursor/plans/active/0001-mvp/02-connectivity/0002-rate-limiting.md`"

### Correct Response

**Step 1: Read and parse the plan**

```bash
cat .cursor/plans/active/0001-mvp/02-connectivity/0002-rate-limiting.md
```

**Step 2: Extract frontmatter todos** (THE SOURCE OF TRUTH):

```yaml
todos:
  - id: token-bucket
    content: Implement token bucket rate limiter
    status: pending
  - id: circuit-breaker
    content: Implement circuit breaker with cockatiel
    status: pending
  - id: backoff
    content: Implement exponential backoff with jitter
    status: pending
  - id: request-policy
    content: Create unified request policy wrapper
    status: pending
  - id: lifecycle-management            # <-- DON'T MISS THIS
    content: Move plan to implemented/
    status: pending
```

**Step 3: Create task list from todos** (not from ## Tasks prose):

```
1. token-bucket - Implement token bucket rate limiter
2. circuit-breaker - Implement circuit breaker with cockatiel
3. backoff - Implement exponential backoff with jitter
4. request-policy - Create unified request policy wrapper
5. lifecycle-management - Move plan to implemented/
```

**Step 4: Execute each task, updating status as you go**

---

## Example 3: Completing a Plan

### User says
"All the rate limiting code is done, please wrap up"

### Correct Response

Execute lifecycle-management immediately:

```bash
# 1. Update plan frontmatter: all todos to completed
# 2. Check all validation boxes [x]
# 3. Update roadmap link

# 4. Move:
mkdir -p .cursor/plans/implemented/0001-mvp/02-connectivity
mv .cursor/plans/active/0001-mvp/02-connectivity/0002-rate-limiting.md \
   .cursor/plans/implemented/0001-mvp/02-connectivity/0002-rate-limiting.md

# 5. Delete from active (MANDATORY):
rm -f .cursor/plans/active/0001-mvp/02-connectivity/0002-rate-limiting.md

# 6. Verify:
test -f .cursor/plans/implemented/0001-mvp/02-connectivity/0002-rate-limiting.md && \
  ! test -f .cursor/plans/active/0001-mvp/02-connectivity/0002-rate-limiting.md && \
  echo "SUCCESS"
```

---

## Common Mistakes and Fixes

### Mistake: Extracting tasks from prose section

**What went wrong:**
```
I looked at "## Tasks" in the plan body and created:
1. Implement token bucket
2. Add circuit breaker
3. Create request wrapper
(Missing lifecycle-management!)
```

**Fix:**
```
Parse YAML frontmatter and extract todos array:
1. token-bucket
2. circuit-breaker
3. backoff
4. request-policy
5. lifecycle-management  <-- Now included
```

### Mistake: Plan exists in both locations

**What went wrong:**
```
$ ls .cursor/plans/*/0001-mvp/02-connectivity/
active/0001-mvp/02-connectivity/0002-rate-limiting.md
implemented/0001-mvp/02-connectivity/0002-rate-limiting.md
```

**Fix:**
```bash
rm -f .cursor/plans/active/0001-mvp/02-connectivity/0002-rate-limiting.md
```

### Mistake: lifecycle-management not in task tracker

**What went wrong:**
Using `TodoWrite` without including lifecycle-management:
```json
{
  "todos": [
    {"id": "task-1", "content": "...", "status": "pending"},
    {"id": "task-2", "content": "...", "status": "pending"}
    // Missing lifecycle-management!
  ]
}
```

**Fix:**
```json
{
  "todos": [
    {"id": "task-1", "content": "...", "status": "pending"},
    {"id": "task-2", "content": "...", "status": "pending"},
    {"id": "lifecycle-management", "content": "Move plan to implemented/", "status": "pending"}
  ]
}
```
