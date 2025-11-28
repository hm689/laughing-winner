# Competitive Order Management System Specification

## Overview
This specification defines the first implementation of a competitive, first-come-first-served order management system with admin
 verification. Multiple users can attempt the same task, but only one verified winner is paid. The system prioritizes fairness,
transparency, and concurrency safety, ensuring tasks close immediately upon admin-approved completion.

## Roles
- **Task Owner**: Authorized user who uploads tasks and funds payment.
- **Participant**: User who discovers and attempts tasks.
- **Admin/Reviewer**: Reviews submissions, approves the first valid completion, and triggers payment.

## Task Lifecycle
1. **Uploaded**: Owner creates task with requirements, deadline, completion criteria, and payment amount; status = `UPLOADED`.
2. **Available**: Task is published to participants; status = `AVAILABLE`.
3. **In-Progress**: Participants may claim (optional) and work; status remains `AVAILABLE`. Track start events without locking t
he task to a single user.
4. **Pending Review**: A participant submits completion; status = `PENDING_REVIEW`, but task stays open to receive other submiss
ions until approval.
5. **Approved/Completed**: Admin approves the first valid submission; status = `APPROVED`.
6. **Closed**: Task locked against further submissions and displayed with winner info; status = `CLOSED`.
7. **Reopened (Exceptional)**: If all submissions are rejected or payment fails irrecoverably, task may be reopened to `AVAILABL
E` with version bump and audit trail.

## Core Functional Requirements
- **Task Upload Module**
  - Create tasks with title, description, acceptance criteria, deadline, payment amount/currency, max attachments, and optional
reference files.
  - Require funding confirmation/escrow before task becomes `AVAILABLE`.
  - Emit notifications to participants (based on preferences) when tasks go live.

- **Submission Queue Management**
  - Accept multiple submissions per task until closure.
  - Capture submission artifacts (files/links), notes, and a precise submission timestamp.
  - Maintain submission state: `PENDING_REVIEW`, `APPROVED`, `REJECTED`.
  - Enforce immutability of submission content after receipt; allow admins to append feedback notes.

- **Admin Verification Dashboard**
  - List tasks with pending submissions ordered by oldest submission time.
  - Provide side-by-side view of task requirements and submission artifacts.
  - Actions: Approve (declares winner), Reject (with feedback), Request Resubmission (optional), Bulk reject all and reopen task
.
  - Show competing submissions and timestamps to support fair review.

- **Winner Declaration & Payment**
  - When admin clicks Approve, execute transactionally:
    1. Lock task row and submission rows for update.
    2. Confirm task not already closed/approved.
    3. Mark selected submission `APPROVED`, others `REJECTED` with reason `Winner already approved`.
    4. Update task status to `CLOSED`, set `winner_submission_id` and `winner_user_id`.
    5. Trigger payment job with idempotent reference (task id + submission id).
  - Payment flow must be idempotent and retried on transient failures; escalate and reopen task only on unrecoverable payment er
rors.

- **Task Closure Logic**
  - Immediately broadcast task closure via websockets/push to all clients.
  - Block new submissions once task status is `CLOSED`.
  - Update list views to show winner, approval time, and payout confirmation.

- **Timestamp Tracking & Audit Trail**
  - Record: task upload time, publication time, participant start/claim events, submission time, admin review time, approval/rej
ection time, payment initiation/completion time.
  - Preserve immutable audit log entries for all state transitions and reviewer actions.

- **User Notification System**
  - Events: task uploaded/available, submission received, submission entered review, admin feedback, winner declared with paymen
t confirmation, task closed by another winner, task reopened.
  - Channels: in-app inbox, email, and optional push; include links to task and submission detail pages.

## Data Model (Relational)
- **users**(id, role, balance, payout_method, created_at, updated_at)
- **tasks**(id, owner_id, title, description, acceptance_criteria, deadline_at, payment_amount, payment_currency, status, funded
_at, published_at, winner_submission_id, winner_user_id, version, created_at, updated_at)
- **task_assets**(id, task_id, url/path, type, created_at)
- **task_events**(id, task_id, user_id, event_type, metadata JSON, created_at) — for audit trail (uploads, publishes, claims, su
bmissions, approvals, reopens, payments).
- **submissions**(id, task_id, user_id, content_blob/path, notes, status, submitted_at, reviewed_at, review_feedback, admin_id)
- **submission_assets**(id, submission_id, url/path, type, created_at)
- **payments**(id, task_id, submission_id, user_id, amount, currency, status, processor_ref, initiated_at, completed_at, failure
_reason)

Indexes: (tasks.status, tasks.deadline_at), (submissions.task_id, submissions.submitted_at), (payments.status), plus unique cons
traint on `tasks.winner_submission_id` and `tasks.winner_user_id` per version.

## Concurrency & Locking Strategy
- Use database transactions with `SELECT ... FOR UPDATE` on the task row during approval to prevent double winners.
- Use unique, idempotent payment key `(task_id, submission_id)` to avoid duplicate payouts.
- Apply optimistic concurrency via task `version` for reopen scenarios; increment on reopen to invalidate stale clients.
- Enforce submission cutoff by checking task status under lock before insert; if `CLOSED`, reject submission with error.

## Business Rules
- Participants may see submission count (configurable) but never submission contents until closure.
- Optional soft-claim: participants can click “Start” to log intent; inactivity for N hours marks claim abandoned via scheduled
job; task remains `AVAILABLE` throughout.
- If all submissions rejected, owner/admin can reopen task: set status `AVAILABLE`, increment version, notify participants, and
retain audit history.
- If payment initiation fails transiently, retry with backoff; if irrecoverable, set task status `PAYMENT_FAILED`, notify admins
, and pause further actions until manual resolution.
- Prevent gaming: rate-limit submissions per user per task, require unique artifact hash check (where feasible), and log IP/devi
ce fingerprints in `task_events`.
- Dispute process: participants can file dispute referencing submission; admin can review logs and override outcomes; overrides
recorded in audit trail with reason.

## Interfaces
- **Participant UI**: task list with status badges, countdown to deadline, submission count (if enabled), and real-time closure
updates; submission form with upload progress and confirmation receipts.
- **Admin Dashboard**: pending-review queue, task detail with all submissions sorted by time, approve/reject controls, and payme
nt status monitor.
- **Owner Console**: funding status, publication controls, and visibility into winner/payment outcomes.

## Notification & Visibility Logic
- Real-time updates via websockets; fallback to polling.
- Status badges: `AVAILABLE`, `PENDING_REVIEW`, `APPROVED`, `CLOSED`, `PAYMENT_FAILED`, `REOPENED`.
- Winner announcement shown on task detail with submission timestamp, approval time, and payout status.

## Performance & Scalability
- Paginate submission lists; store large artifacts in object storage with signed URLs.
- Offload payment and notification sending to background workers with idempotent jobs.
- Cache task list results with short TTL; invalidate on task update/closure events.

## Operational Considerations
- Monitoring: dashboards for pending-review backlog, approval latency, payment success rate.
- Security: authorization checks for each action, malware scanning for uploads, and least-privilege access to payment credential
s.
- Backups: regular database backups and object storage lifecycle policies.
- Compliance: retain audit logs for configured retention period; allow export for disputes.

## Interactive Mock Interface
A lightweight, client-only interface demonstrates the participant and admin workflows side by side. It uses in-memory data to si
mulate submissions, approvals, and instant task closure after a winner is chosen.

### Running the demo
1. Serve the static files locally: `python -m http.server 8000`.
2. Open `http://localhost:8000` in your browser.
3. Use the participant panel to submit work; use the admin panel to approve or reject. Approving immediately closes the task, re
jects competitors, and logs payment notifications.

### What you can simulate
- Competing submissions on the same task queued for admin review.
- Admin approval that declares a single winner, triggers a mock payment, and instantly blocks further submissions.
- Rejections that reopen the task when no pending submissions remain.
- Notification feed mirroring submission receipts, approvals, closures, and payments.
