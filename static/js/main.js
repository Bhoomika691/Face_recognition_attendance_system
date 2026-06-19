// ── STATE ─────────────────────────────────────────────────────────────────────
const shown    = new Set();  // Tracks displayed activity events
let   isAdmin  = false;      // Tracks admin login state

// ── TAB SWITCHING ────────────────────────────────────────────────────────────
function switchTab(name) {
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('tab-' + name).classList.add('active');
    document.querySelectorAll('.nav-btn').forEach(b => {
        if (b.getAttribute('onclick').includes("'" + name + "'"))
            b.classList.add('active');
    });
    if (name === 'attendance') loadAttendance();
    if (name === 'reports')    initReportDates();
    if (name === 'register')   checkAdminForRegister();
}

// ── LOAD REGISTERED PEOPLE ───────────────────────────────────────────────────
async function loadPeople() {
    try {
        const res  = await fetch('/api/registered');
        const data = await res.json();
        const list = document.getElementById('people-list');
        list.innerHTML = data.people.length
            ? data.people.map(n => `<li>${n}</li>`).join('')
            : '<li class="muted">No people registered yet.</li>';
    } catch(e) { console.error(e); }
}

// ── ACTIVITY POLLING ─────────────────────────────────────────────────────────
async function pollActivity() {
    try {
        const res  = await fetch('/api/activity');
        const data = await res.json();
        const list = document.getElementById('activity-list');

        const newEvents = data.events.filter(ev => {
            const key = ev.name + ev.time + ev.status;
            if (shown.has(key)) return false;
            shown.add(key);
            return true;
        });

        if (newEvents.length > 0) {
            if (list.querySelector('.muted')) list.innerHTML = '';
            newEvents.forEach(ev => {
                const li  = document.createElement('li');
                let cls   = 'duplicate', clr = '#f97316';
                if (ev.status === 'Sign-In')  { cls = 'signin';  clr = '#22c55e'; }
                if (ev.status === 'Sign-Out') { cls = 'signout'; clr = '#3b82f6'; }
                li.className = cls;
                li.innerHTML = `
                    <span class="act-time">${ev.time}</span>
                    <div class="act-name">${ev.name}</div>
                    <div class="act-status" style="color:${clr}">
                        ${ev.status}${ev.note ? ' — ' + ev.note : ''}
                    </div>`;
                list.insertBefore(li, list.firstChild);
            });
            while (list.children.length > 30) list.removeChild(list.lastChild);
        }
    } catch(e) { console.error(e); }
    setTimeout(pollActivity, 2000);
}

// ── ATTENDANCE LOG ───────────────────────────────────────────────────────────
async function loadAttendance() {
    const excludeDup = !document.getElementById('show-duplicates').checked;
    try {
        const res  = await fetch(`/api/attendance?exclude_duplicates=${excludeDup}`);
        const data = await res.json();
        renderTable('att-tbody', data.records, 4);
        document.getElementById('log-count').textContent =
            `${data.records.length} record${data.records.length !== 1 ? 's' : ''}`;
    } catch(e) { console.error(e); }
}

// ── TABLE RENDERER ───────────────────────────────────────────────────────────
function renderTable(tbodyId, records, cols = 6) {
    const tbody = document.getElementById(tbodyId);
    if (!records || !records.length) {
        tbody.innerHTML = `<tr><td colspan="${cols}" class="empty-msg">No records found.</td></tr>`;
        return;
    }
    tbody.innerHTML = records.map(r => {
        // Status badge
        let bc = 'b-dup', label = r.Status || '';
        if (r.Status === 'Login')  { bc = 'b-in';  label = '🟢 Login';  }
        if (r.Status === 'Logout') { bc = 'b-out'; label = '🔵 Logout'; }

        // Total hours — show dash if empty (person still signed in)
        const totalHours = r['Total-Hours']
            ? `<strong>${r['Total-Hours']}</strong>`
            : '<span style="color:#64748b">Still signed in</span>';

        // Out-time — show dash if not yet signed out
        const outTime = r['Out-Time'] || '<span style="color:#64748b">—</span>';

        return `<tr>
            <td><strong>${r.Name || ''}</strong></td>
            <td>${r.Date || ''}</td>
            <td>${r['In-Time'] || ''}</td>
            <td>${outTime}</td>
            <td><span class="badge ${bc}">${label}</span></td>
            <td>${totalHours}</td>
        </tr>`;
    }).join('');
}

// ── REPORTS ──────────────────────────────────────────────────────────────────
function initReportDates() {
    // Set default date range to today
    const today = new Date().toISOString().split('T')[0];
    const startEl = document.getElementById('report-start');
    const endEl   = document.getElementById('report-end');
    if (!startEl.value) startEl.value = today;
    if (!endEl.value)   endEl.value   = today;
}

async function loadReport() {
    const start      = document.getElementById('report-start').value;
    const end        = document.getElementById('report-end').value;
    const hideDup    = document.getElementById('report-hide-dup').checked;

    if (!start || !end) {
        alert('Please select both start and end dates.');
        return;
    }
    if (start > end) {
        alert('Start date cannot be after end date.');
        return;
    }

    try {
        const res  = await fetch(`/api/attendance?date=${start}&exclude_duplicates=${hideDup}`);

        // For range, we fetch day by day and combine
        // (simple approach — works well for most date ranges)
        const allRecords = [];
        const startDate  = new Date(start);
        const endDate    = new Date(end);

        for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
            const dateStr = d.toISOString().split('T')[0];
            const r = await fetch(`/api/attendance?date=${dateStr}&exclude_duplicates=${hideDup}`);
            const data = await r.json();
            allRecords.push(...data.records);
        }

        renderTable('report-tbody', allRecords, 4);

        // Summary counts
        const ins    = allRecords.filter(r => r.Status === 'Sign-In').length;
        const outs   = allRecords.filter(r => r.Status === 'Sign-Out').length;
        const dups   = allRecords.filter(r => r.Status === 'Duplicate Blocked').length;
        document.getElementById('sum-in').textContent    = ins;
        document.getElementById('sum-out').textContent   = outs;
        document.getElementById('sum-dup').textContent   = dups;
        document.getElementById('sum-total').textContent = allRecords.length;
        document.getElementById('summary-cards').classList.remove('hidden');

    } catch(e) { console.error(e); }
}

// ── DOWNLOAD ─────────────────────────────────────────────────────────────────
function downloadReport(format) {
    const start   = document.getElementById('report-start').value;
    const end     = document.getElementById('report-end').value;
    const hideDup = document.getElementById('report-hide-dup').checked;

    if (!start || !end) {
        alert('Please select a date range first.');
        return;
    }

    // Build download URL and trigger browser download
    const url = `/api/download/${format}?start=${start}&end=${end}&exclude_duplicates=${hideDup}`;
    const a   = document.createElement('a');
    a.href    = url;
    a.click();
}

// ── ADMIN LOGIN ───────────────────────────────────────────────────────────────
async function adminLogin() {
    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value.trim();
    const resultEl = document.getElementById('login-result');

    if (!username || !password) {
        showLoginResult(false, 'Please enter username and password.');
        return;
    }

    try {
        const res  = await fetch('/admin/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const data = await res.json();

        if (data.success) {
            isAdmin = true;
            // Show register panel, hide login wall
            document.getElementById('login-wall').classList.add('hidden');
            document.getElementById('register-panel').classList.remove('hidden');
            // Show admin status in sidebar
            document.getElementById('admin-sidebar-status').classList.remove('hidden');
        } else {
            showLoginResult(false, data.message);
        }
    } catch(e) {
        showLoginResult(false, 'Network error.');
    }
}

function showLoginResult(ok, msg) {
    const d = document.getElementById('login-result');
    d.textContent = (ok ? '✅ ' : '❌ ') + msg;
    d.className   = 'reg-result ' + (ok ? 'success' : 'error');
    setTimeout(() => d.className = 'reg-result hidden', 5000);
}

async function adminLogout() {
    await fetch('/admin/logout', { method: 'POST' });
    isAdmin = false;
    document.getElementById('admin-sidebar-status').classList.add('hidden');
    document.getElementById('login-wall').classList.remove('hidden');
    document.getElementById('register-panel').classList.add('hidden');
    document.getElementById('login-username').value = '';
    document.getElementById('login-password').value = '';
}

function checkAdminForRegister() {
    // Check with server if admin session is still valid
    fetch('/admin/status').then(r => r.json()).then(data => {
        if (data.is_admin) {
            document.getElementById('login-wall').classList.add('hidden');
            document.getElementById('register-panel').classList.remove('hidden');
            document.getElementById('admin-sidebar-status').classList.remove('hidden');
        } else {
            document.getElementById('login-wall').classList.remove('hidden');
            document.getElementById('register-panel').classList.add('hidden');
        }
    });
}

// ── REGISTER FACE ────────────────────────────────────────────────────────────
async function registerFace() {
    const name = document.getElementById('reg-name').value.trim();
    if (!name) { showRegResult(false, 'Please enter a name first.'); return; }

    const btn = document.querySelector('.btn-capture');
    btn.textContent = '⏳ Capturing...';
    btn.disabled    = true;

    try {
        const res  = await fetch('/api/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name })
        });
        const data = await res.json();
        showRegResult(data.success, data.message);
        if (data.success) {
            document.getElementById('reg-name').value = '';
            loadPeople();
        }
    } catch(e) {
        showRegResult(false, 'Network error.');
    }

    btn.textContent = '📸 Capture & Register';
    btn.disabled    = false;
}

function showRegResult(ok, msg) {
    const d = document.getElementById('reg-result');
    d.textContent = (ok ? '✅ ' : '❌ ') + msg;
    d.className   = 'reg-result ' + (ok ? 'success' : 'error');
    setTimeout(() => d.className = 'reg-result hidden', 5000);
}

// ── INIT ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    loadPeople();
    pollActivity();
    initReportDates();
    checkAdminForRegister();
});


async function loadMonthlyPercentage() {

    const start = document.getElementById('report-start').value;
    if (!start) {
        alert("Please select a date.");
        return;
    }

    const month = start.substring(0,7);

    const res  = await fetch(`/api/monthly_percentage?month=${month}`);
    const data = await res.json();

    const tbody = document.getElementById('monthly-tbody');

    if (!data.records || !data.records.length) {
        tbody.innerHTML = `
            <tr>
                <td colspan="4" class="empty-msg">No data found.</td>
            </tr>`;
        return;
    }

    tbody.innerHTML = data.records.map(r => `
        <tr>
            <td><strong>${r.Name}</strong></td>
            <td>${r['Present Days']}</td>
            <td>${r['Working Days']}</td>
            <td><strong>${r.Percentage}%</strong></td>
        </tr>
    `).join('');
}