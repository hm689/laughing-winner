const tasks = [
  {
    id: "T-1042",
    title: "Draft marketing one-pager",
    description: "Summarize the new launch in one page with CTA and pricing table.",
    acceptance: "Meets brief, no typos, includes CTA and updated pricing.",
    deadline: addMinutes(new Date(), 180),
    payment: "$250",
    status: "AVAILABLE",
    version: 1,
    publishedAt: minutesAgo(40),
    fundedAt: minutesAgo(45),
    winnerSubmissionId: null,
    winnerUserId: null,
  },
  {
    id: "T-1043",
    title: "Bug triage sweep",
    description: "Validate reported bugs, reproduce, and add repro steps.",
    acceptance: "At least 10 tickets triaged with repro steps in tracker.",
    deadline: addMinutes(new Date(), 60),
    payment: "$120",
    status: "PENDING_REVIEW",
    version: 1,
    publishedAt: minutesAgo(25),
    fundedAt: minutesAgo(30),
    winnerSubmissionId: null,
    winnerUserId: null,
  },
];

const submissions = [
  {
    id: "S-5001",
    taskId: "T-1043",
    user: "Patricia",
    notes: "Reviewed 12 tickets, added repro GIFs.",
    status: "PENDING_REVIEW",
    submittedAt: minutesAgo(10),
    reviewedAt: null,
    feedback: null,
    admin: null,
    content: "Link: https://tracker.local/batch-12",
  },
  {
    id: "S-5002",
    taskId: "T-1043",
    user: "Sam",
    notes: "Triaged 10 issues, added labels.",
    status: "PENDING_REVIEW",
    submittedAt: minutesAgo(6),
    reviewedAt: null,
    feedback: null,
    admin: null,
    content: "Link: https://tracker.local/sam-triage",
  },
];

let selectedTaskId = null;
let selectedSubmissionId = null;
let notificationFeed = [];

// Utilities
function minutesAgo(mins) {
  return new Date(Date.now() - mins * 60 * 1000);
}

function addMinutes(date, mins) {
  return new Date(date.getTime() + mins * 60 * 1000);
}

function formatDate(date) {
  return new Intl.DateTimeFormat("en", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatStatus(status) {
  switch (status) {
    case "AVAILABLE":
      return { label: "Available", className: "available", dot: "open" };
    case "PENDING_REVIEW":
      return { label: "Pending review", className: "pending", dot: "pending" };
    case "CLOSED":
      return { label: "Closed", className: "closed", dot: "closed" };
    case "APPROVED":
      return { label: "Approved", className: "closed", dot: "closed" };
    case "REJECTED":
      return { label: "Rejected", className: "rejected", dot: "rejected" };
    default:
      return { label: status, className: "", dot: "" };
  }
}

function renderTasks() {
  const container = document.getElementById("task-list");
  container.innerHTML = "";

  tasks.forEach((task) => {
    const card = document.createElement("div");
    card.className = `task-card ${selectedTaskId === task.id ? "active" : ""}`;
    card.onclick = () => {
      selectedTaskId = task.id;
      selectedSubmissionId = getTaskPendingSubmissions(task.id)[0]?.id || null;
      renderAll();
    };

    const status = formatStatus(task.status);
    card.innerHTML = `
      <div class="badges">
        <span class="badge ${status.className}">${status.label}</span>
        <span class="badge payment">Payment ${task.payment}</span>
      </div>
      <h4>${task.title}</h4>
      <p class="meta">Deadline • ${formatDate(task.deadline)}</p>
      <p class="meta">Published • ${formatDate(task.publishedAt)}</p>
    `;

    container.appendChild(card);
  });
}

function renderTaskDetail() {
  const task = tasks.find((t) => t.id === selectedTaskId);
  const detail = document.getElementById("task-detail");

  if (!task) {
    detail.innerHTML = `<p class="meta">Select a task to view details.</p>`;
    return;
  }

  const status = formatStatus(task.status);
  const winner = task.winnerUserId ? `<p class="meta">Winner • ${task.winnerUserId}</p>` : "";

  const pendingCount = submissions.filter(
    (s) => s.taskId === task.id && s.status === "PENDING_REVIEW"
  ).length;

  detail.innerHTML = `
    <div class="status-row">
      <div class="status-dot ${status.dot}"></div>
      <p class="meta"><strong>Status:</strong> ${status.label}</p>
    </div>
    <h3>${task.title}</h3>
    <p class="meta">Payment • ${task.payment}</p>
    <p class="meta">Deadline • ${formatDate(task.deadline)} | Published • ${formatDate(task.publishedAt)}</p>
    <p class="meta">Acceptance • ${task.acceptance}</p>
    <p>${task.description}</p>
    <p class="meta">Submissions waiting review • ${pendingCount}</p>
    ${winner}
  `;
}

function renderSubmissionForm() {
  const formCard = document.getElementById("submission-form");
  const task = tasks.find((t) => t.id === selectedTaskId);
  if (!task) {
    formCard.innerHTML = `<p class="meta">Choose a task before submitting.</p>`;
    return;
  }
  const closed = task.status === "CLOSED" || task.status === "APPROVED";

  formCard.innerHTML = `
    <h3>Submit completion</h3>
    ${closed ? `<p class="alert">Task closed to new submissions.</p>` : ""}
    <form id="submit-form">
      <div>
        <label for="participant-name">Your name</label>
        <input id="participant-name" name="name" placeholder="Patricia" required />
      </div>
      <div>
        <label for="artifact">Work link</label>
        <input id="artifact" name="artifact" placeholder="https://..." required />
      </div>
      <div>
        <label for="notes">Notes</label>
        <textarea id="notes" name="notes" rows="3" placeholder="Summary of what you completed"></textarea>
      </div>
      <button type="submit" ${closed ? "disabled" : ""}>Send submission</button>
    </form>
  `;

  const form = document.getElementById("submit-form");
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (closed) return;

    const data = new FormData(form);
    const submission = {
      id: `S-${Math.floor(Math.random() * 9000 + 1000)}`,
      taskId: task.id,
      user: data.get("name") || "Anon",
      notes: data.get("notes") || "",
      status: "PENDING_REVIEW",
      submittedAt: new Date(),
      reviewedAt: null,
      feedback: null,
      admin: null,
      content: data.get("artifact"),
    };

    if (task.status === "CLOSED") {
      pushNotification("Submission blocked", `${submission.user}'s submission rejected because the task is closed.`);
      return;
    }

    submissions.push(submission);
    selectedSubmissionId = submission.id;
    if (task.status === "AVAILABLE") task.status = "PENDING_REVIEW";
    pushNotification("Submission received", `${submission.user} submitted ${task.id} at ${formatDate(submission.submittedAt)}.`);
    renderAll();
    form.reset();
  });
}

function getTaskPendingSubmissions(taskId) {
  return submissions
    .filter((s) => s.taskId === taskId && s.status === "PENDING_REVIEW")
    .sort((a, b) => a.submittedAt - b.submittedAt);
}

function renderQueue() {
  const queueContainer = document.getElementById("review-queue");
  queueContainer.innerHTML = "";

  const pending = submissions.filter((s) => s.status === "PENDING_REVIEW");
  pending.sort((a, b) => a.submittedAt - b.submittedAt);

  document.getElementById("queue-meta").textContent = `${pending.length} awaiting review`;

  if (!pending.length) {
    const emptyState = document.createElement("p");
    emptyState.className = "meta";
    emptyState.textContent = "No submissions waiting for review.";
    queueContainer.appendChild(emptyState);
    return;
  }

  pending.forEach((sub) => {
    const task = tasks.find((t) => t.id === sub.taskId);
    const card = document.createElement("div");
    card.className = `task-card ${selectedSubmissionId === sub.id ? "active" : ""}`;
    card.onclick = () => {
      selectedSubmissionId = sub.id;
      selectedTaskId = sub.taskId;
      renderAll();
    };

    card.innerHTML = `
      <div class="badges">
        <span class="badge pending">Pending review</span>
        <span class="badge">${task.title}</span>
      </div>
      <h4>${sub.user}'s submission</h4>
      <p class="meta">Submitted • ${formatDate(sub.submittedAt)}</p>
      <p class="meta">Task • ${task.id} (${task.payment})</p>
    `;

    queueContainer.appendChild(card);
  });
}

function renderReviewDetail() {
  const container = document.getElementById("review-detail");
  const submission = submissions.find((s) => s.id === selectedSubmissionId);

  if (!submission) {
    container.innerHTML = `<p class="meta">Select a submission to review.</p>`;
    return;
  }

  const task = tasks.find((t) => t.id === submission.taskId);
  const status = formatStatus(submission.status);

  container.innerHTML = `
    <div class="status-row">
      <div class="status-dot ${status.dot}"></div>
      <p class="meta"><strong>${status.label}</strong> • ${task.title}</p>
    </div>
    <h3>${submission.user}'s work</h3>
    <p class="meta">Submitted • ${formatDate(submission.submittedAt)}</p>
    <p class="meta">Content • ${submission.content}</p>
    <p>${submission.notes}</p>
    <div class="badges">
      <span class="badge">Task ${task.id}</span>
      <span class="badge payment">Payment ${task.payment}</span>
    </div>
    <div class="action-row">
      <button id="approve">Approve & pay</button>
      <button class="secondary" id="reject">Reject</button>
      <button class="secondary" id="reopen" ${task.status === "CLOSED" && !task.winnerSubmissionId ? "" : "disabled"}>Reopen task</button>
    </div>
  `;

  document.getElementById("approve").onclick = () => approveSubmission(submission.id);
  document.getElementById("reject").onclick = () => rejectSubmission(submission.id);
  document.getElementById("reopen").onclick = () => reopenTask(task.id);
}

function approveSubmission(submissionId) {
  const submission = submissions.find((s) => s.id === submissionId);
  const task = tasks.find((t) => t.id === submission.taskId);
  if (!submission || !task) return;
  if (task.status === "CLOSED") return;

  task.status = "CLOSED";
  task.winnerSubmissionId = submission.id;
  task.winnerUserId = submission.user;

  submission.status = "APPROVED";
  submission.reviewedAt = new Date();
  submission.admin = "Admin";

  submissions
    .filter((s) => s.taskId === task.id && s.id !== submission.id && s.status === "PENDING_REVIEW")
    .forEach((s) => {
      s.status = "REJECTED";
      s.reviewedAt = new Date();
      s.feedback = "Winner already approved";
      s.admin = "Admin";
    });

  pushNotification("Winner declared", `${submission.user} wins ${task.id}. Payment triggered.`);
  pushNotification("Task closed", `${task.id} closed immediately after approval.`);
  simulatePayment(task, submission);
  renderAll();
}

function rejectSubmission(submissionId) {
  const submission = submissions.find((s) => s.id === submissionId);
  const task = tasks.find((t) => t.id === submission.taskId);
  if (!submission || !task) return;

  submission.status = "REJECTED";
  submission.reviewedAt = new Date();
  submission.admin = "Admin";
  submission.feedback = "Does not meet acceptance criteria";

  if (!getTaskPendingSubmissions(task.id).length) {
    task.status = "AVAILABLE";
    pushNotification("Task reopened", `${task.id} reopened after all submissions rejected.`);
  }

  pushNotification("Submission rejected", `${submission.user}'s submission rejected.`);
  renderAll();
}

function reopenTask(taskId) {
  const task = tasks.find((t) => t.id === taskId);
  if (!task) return;
  task.status = "AVAILABLE";
  task.version += 1;
  task.winnerSubmissionId = null;
  task.winnerUserId = null;
  pushNotification("Task reopened", `${task.id} reopened with version ${task.version}.`);
  renderAll();
}

function simulatePayment(task, submission) {
  setTimeout(() => {
    pushNotification("Payment completed", `${submission.user} paid ${task.payment} for ${task.id}.`);
  }, 600);
}

function pushNotification(tag, message) {
  notificationFeed.unshift({
    id: crypto.randomUUID(),
    tag,
    message,
    time: new Date(),
  });
  renderFeed();
}

function renderFeed() {
  const feed = document.getElementById("notification-feed");
  feed.innerHTML = "";

  notificationFeed.slice(0, 30).forEach((item) => {
    const node = document.createElement("div");
    node.className = "feed-item";
    node.innerHTML = `
      <div>
        <div class="tag">${item.tag}</div>
        <div class="time">${formatDate(item.time)}</div>
      </div>
      <p class="message">${item.message}</p>
    `;
    feed.appendChild(node);
  });
}

function renderAll() {
  renderTasks();
  renderTaskDetail();
  renderSubmissionForm();
  renderQueue();
  renderReviewDetail();
  renderFeed();
}

function bootstrapFeed() {
  pushNotification("System", "Workspace initialized with mock data.");
  pushNotification("Tasks", "Two tasks published to participants.");
  pushNotification("Queue", "Submissions awaiting admin verification.");
}

window.addEventListener("DOMContentLoaded", () => {
  document.getElementById("refresh-btn").onclick = renderAll;
  document.getElementById("clear-log").onclick = () => {
    notificationFeed = [];
    renderFeed();
  };
  initializeSelection();
  bootstrapFeed();
  renderAll();
});

function initializeSelection() {
  const firstTaskId = tasks[0]?.id;
  const earliestPending =
    (firstTaskId ? getTaskPendingSubmissions(firstTaskId)[0] : null) ||
    submissions.slice().sort((a, b) => a.submittedAt - b.submittedAt)[0];
  if (earliestPending) {
    selectedSubmissionId = earliestPending.id;
    selectedTaskId = earliestPending.taskId;
  } else {
    selectedTaskId = tasks[0]?.id || null;
  }
}
