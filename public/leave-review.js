(function(){
  const API_BASE = '/api';
  const params = new URLSearchParams(window.location.search);
  const leaveId = params.get('leaveId');
  // Support multiple token key names that may be present in localStorage
  const authToken = localStorage.getItem('authToken') || localStorage.getItem('token') || localStorage.getItem('accessToken');

  function getAuthToken() {
    return localStorage.getItem('authToken') || localStorage.getItem('token') || localStorage.getItem('accessToken') || null;
  }

  async function apiFetch(path, options = {}) {
    const token = getAuthToken();
    const url = path.startsWith('http') ? path : (`${API_BASE}${path.startsWith('/') ? path : '/' + path}`);
    const headers = new Headers(options.headers || {});
    if (token) headers.set('Authorization', `Bearer ${token}`);
    if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
    const opts = Object.assign({}, options, { headers });
    const res = await fetch(url, opts);
    if (res.status === 401) {
      localStorage.removeItem('authToken');
      localStorage.removeItem('token');
      localStorage.removeItem('accessToken');
      setTimeout(()=>{ window.location.href = '/'; }, 800);
    }
    return res;
  }

  const container = document.getElementById('review-container');
  const detailsEl = document.getElementById('leave-details');
  const actionsEl = document.getElementById('actions');
  const loadingEl = document.getElementById('loading');

  function showAlert(message, type='info'){
    const alert = document.createElement('div');
    alert.className = `alert alert-${type}`;
    alert.textContent = message;
    document.body.appendChild(alert);
    setTimeout(()=>{ if(alert.parentNode) alert.parentNode.removeChild(alert); }, 4000);
  }

  if (!leaveId) {
    loadingEl.textContent = 'No leave selected.';
    return;
  }

  if (!authToken) {
    loadingEl.textContent = 'You must be logged in to review leave requests.';
    setTimeout(()=>{ window.location.href = '/'; }, 1500);
    return;
  }

  async function fetchLeave() {
    try {
      const res = await apiFetch(`/leaves/${leaveId}`);
      if (!res.ok) {
        if (res.status === 401) {
          const err = await res.json().catch(()=>({ message: 'Authentication required' }));
          loadingEl.textContent = `${err.error || 'Unauthorized'}: ${err.message}`;
          // Redirect to login after a short delay
          setTimeout(()=>{ window.location.href = '/'; }, 1400);
          return;
        }
        const text = await res.text();
        loadingEl.textContent = 'Failed to load leave: ' + res.status + ' ' + text;
        return;
      }

      const payload = await res.json();
      const leave = payload.leave;
      renderLeave(leave);
    } catch (err) {
      console.error(err);
      loadingEl.textContent = 'Network error while loading leave.';
    }
  }

  function renderLeave(leave){
    loadingEl.style.display = 'none';
    detailsEl.style.display = 'block';
    detailsEl.innerHTML = `
      <form id="leave-request-form" class="leave-request-form" onsubmit="return false;">
        <div class="form-row">
          <label>Leave Type</label>
          <input type="text" value="${leave.leaveType.name}" disabled />
        </div>
        <div class="form-row">
          <label>Start Date</label>
          <input type="text" value="${leave.startDate}" disabled />
        </div>
        <div class="form-row">
          <label>End Date</label>
          <input type="text" value="${leave.endDate}" disabled />
        </div>
        <div class="form-row">
          <label>Number of Days</label>
          <input type="text" value="${leave.numberOfDays}" disabled />
        </div>
        <div class="form-row">
          <label>Number of Hours</label>
          <input type="text" value="${leave.numberOfHours || 0}" disabled />
        </div>
        <div class="form-row">
          <label>Half Day</label>
          <input type="text" value="${leave.isHalfDay ? 'Yes (' + (leave.halfDayType || '') + ')' : 'No'}" disabled />
        </div>
        <div class="form-row">
          <label>Emergency Contact</label>
          <input type="text" value="${leave.emergencyContact || '-'}" disabled />
        </div>
        <div class="form-row">
          <label>Reason</label>
          <textarea disabled>${leave.reason}</textarea>
        </div>
        ${leave.handoverNotes ? `
          <div class="form-row">
            <label>Handover Notes</label>
            <textarea disabled>${leave.handoverNotes}</textarea>
          </div>
        ` : ''}
        ${leave.attachmentPath ? `
          <div class="form-row">
            <label>Attachment</label>
            <a href="${leave.attachmentPath}" target="_blank">Download</a>
          </div>
        ` : ''}
        <div class="form-row">
          <label>Submitted At</label>
          <input type="text" value="${new Date(leave.createdAt).toLocaleString()}" disabled />
        </div>
      </form>

      <div id="form-actions" style="display:none; margin-top:12px;">
        <button id="form-approve-btn" class="btn btn-primary" style="margin-right:8px;">Approve</button>
        <button id="form-reject-btn" class="btn btn-secondary">Reject</button>
      </div>

      <div class="leave-detail-card">
        <div class="leave-detail-main">
          <h2 style="margin-bottom:8px;">${leave.User.firstName} ${leave.User.lastName}</h2>
          <div class="detail-row"><span class="detail-label">Department</span><span class="detail-value">${leave.User.department || '-'}</span></div>
          <div class="detail-row"><span class="detail-label">Position</span><span class="detail-value">${leave.User.position || '-'}</span></div>
          <hr style="margin:12px 0;" />
          <div class="detail-row"><span class="detail-label">Type of Leave</span><span class="detail-value">${leave.leaveType.name}</span></div>
          <div class="detail-row"><span class="detail-label">Duration</span><span class="detail-value">${leave.numberOfDays} day(s)</span></div>
          <div class="detail-row"><span class="detail-label">Dates</span><span class="detail-value">${leave.startDate} to ${leave.endDate}</span></div>
          <div class="detail-row"><span class="detail-label">Reason</span><div class="detail-value">${leave.reason}</div></div>
          ${leave.handoverNotes ? `<div class="detail-row"><span class="detail-label">Handover Notes</span><div class="detail-value">${leave.handoverNotes}</div></div>` : ''}
          ${leave.attachmentPath ? `<div class="detail-row"><span class="detail-label">Attachment</span><div class="detail-value"><a href="${leave.attachmentPath}" target="_blank">Download</a></div></div>` : ''}
        </div>
        <aside class="leave-detail-side">
          <div class="detail-row"><span class="detail-label">Submitted</span><span class="detail-value">${new Date(leave.createdAt).toLocaleString()}</span></div>
          <div class="detail-row"><span class="detail-label">Requested By</span><span class="detail-value">${leave.User.firstName} ${leave.User.lastName}</span></div>
          <div class="detail-row"><span class="detail-label">Status</span><span class="detail-value"><span class="leave-status ${leave.status}">${leave.status}</span></span></div>
          <div style="height:8px"></div>
          <div class="detail-row"><span class="detail-label">Leave Type Details</span><span class="detail-value">${leave.leaveType.description || '-'}</span></div>
        </aside>
      </div>
    `;

    // Render manager actions only if user is manager/hr/admin and leave is pending
    // We will fetch current user info from /api/auth/me
    setupActions(leave);
  }

  async function setupActions(leave){
    try {
  const meRes = await apiFetch('/auth/me');
      if (!meRes.ok) {
        actionsEl.style.display = 'none';
        const formActions = document.getElementById('form-actions');
        if (formActions) formActions.style.display = 'none';
        return;
      }
  const mePayload = await meRes.json();
  // Support responses that either wrap the user as { user: { ... } }
  // or return the user object directly. Defensively handle missing user.
  const user = (mePayload && (mePayload.user || mePayload)) || null;

  if (user && ['manager','hr','admin'].includes(user.role) && leave.status === 'pending') {
        actionsEl.style.display = 'block';
        const formActions = document.getElementById('form-actions');
        if (formActions) {
          formActions.style.display = 'block';
          // remove previous handlers to avoid duplicates
          document.getElementById('form-approve-btn').onclick = () => handleAction('approve');
          document.getElementById('form-reject-btn').onclick = async () => {
            const reason = prompt('Provide a reason for rejection (required):');
            if (!reason || reason.trim().length < 5) { showAlert('Rejection reason required (min 5 chars)', 'error'); return; }
            handleAction('reject', reason.trim());
          };
        }
        actionsEl.innerHTML = `
          <div class="manager-notes">
            <label for="manager-notes">Manager Notes (optional)</label>
            <textarea id="manager-notes" rows="3" class="manager-notes" style="padding:8px; border:1px solid var(--border-color); border-radius:8px; width:100%;"></textarea>
          </div>
          <div style="display:flex; gap:8px; align-items:center;">
            <button id="approve-btn" class="btn btn-primary action-fixed-btn">Approve</button>
            <button id="reject-btn" class="btn btn-secondary action-fixed-btn">Reject</button>
          </div>
        `;

        document.getElementById('approve-btn').addEventListener('click', () => handleAction('approve'));
        document.getElementById('reject-btn').addEventListener('click', async () => {
          const reason = prompt('Provide a reason for rejection (required):');
          if (!reason || reason.trim().length < 5) { showAlert('Rejection reason required (min 5 chars)', 'error'); return; }
          handleAction('reject', reason.trim());
        });
      } else {
        actionsEl.style.display = 'none';
        const formActions = document.getElementById('form-actions');
        if (formActions) formActions.style.display = 'none';
      }
    } catch (err) {
      console.error(err);
      actionsEl.style.display = 'none';
    }
  }

  async function handleAction(action, rejectionReason) {
    try {
      const managerNotes = document.getElementById('manager-notes') ? document.getElementById('manager-notes').value.trim() : '';
      const payload = { action };
      if (managerNotes) payload.managerNotes = managerNotes;
      if (action === 'reject') payload.rejectionReason = rejectionReason;

      const res = await apiFetch(`/leaves/${leaveId}/approve`, {
        method: 'PUT',
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        showAlert(`Leave ${action === 'approve' ? 'approved' : 'rejected'} successfully`, 'success');
        // After action redirect back to dashboard approvals
        setTimeout(()=>{ window.location.href = '/index.html#leave-approvals'; }, 800);
      } else {
        const err = await res.json();
        showAlert(err.message || 'Failed to process action', 'error');
      }
    } catch (err) {
      console.error(err);
      showAlert('Network error while processing action', 'error');
    }
  }

  // Start
  fetchLeave();
})();
