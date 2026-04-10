// ── Global state ────────────────────────────────────────────────────
let STATE = { courses: [], assignments: [], stats: {} };

// ── Routing ──────────────────────────────────────────────────────────
function goto(page) {
  history.pushState({}, '', '/app/' + page);
  window.CURRENT_PAGE = page;
  // update sidebar active
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(el => {
    if (el.getAttribute('onclick') === `goto('${page}')`) el.classList.add('active');
  });
  initPage(page);
}

async function initPage(page) {
  await loadData();
  const pc = document.getElementById('page-container');
  pc.innerHTML = '';
  const pages = {
    dashboard:    renderDashboard,
    assignments:  renderAssignments,
    courses:      renderCourses,
    ai:           renderAIPriority,
    study:        renderStudyPlan,
    grade:        renderGradeSimulator,
    collision:    renderCollision,
    group:        renderGroup,
    calendar:     renderCalendar,
    productivity: renderProductivity,
  };
  if (pages[page]) pages[page](pc);
}

async function loadData() {
  const [courses, assignments, stats] = await Promise.all([
    fetch('/api/courses').then(r => r.json()),
    fetch('/api/assignments').then(r => r.json()),
    fetch('/api/stats').then(r => r.json()),
  ]);
  STATE.courses = courses;
  STATE.assignments = assignments;
  STATE.stats = stats;
  // Update urgent badge
  const badge = document.getElementById('urgent-badge');
  if (badge) {
    if (stats.urgent > 0) { badge.textContent = stats.urgent; badge.style.display = 'inline'; }
    else badge.style.display = 'none';
  }
}

// ── Toast ────────────────────────────────────────────────────────────
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = '✦ ' + msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3200);
}

// ── Modal ─────────────────────────────────────────────────────────────
function openModal(title, body, footer) {
  document.getElementById('modal-title').innerHTML  = title;
  document.getElementById('modal-body').innerHTML   = body;
  document.getElementById('modal-footer').innerHTML = footer;
  document.getElementById('modal-overlay').classList.add('open');
}
function closeModal() {
  document.getElementById('modal-overlay').classList.remove('open');
}

// ── Helpers ───────────────────────────────────────────────────────────
function fmt(dateStr) {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
function dueChip(a) {
  if (a.status === 'Completed') return `<span class="due-chip due-later">Done</span>`;
  const d = a.days_until;
  if (d < 0)  return `<span class="due-chip overdue">${Math.abs(d)}d late</span>`;
  if (d === 0) return `<span class="due-chip due-today">Today</span>`;
  if (d <= 2)  return `<span class="due-chip due-soon">${d}d</span>`;
  return `<span class="due-chip due-later">${d}d</span>`;
}
function priorityColor(p) {
  return p === 'High' ? 'var(--red)' : p === 'Medium' ? 'var(--gold)' : 'var(--green)';
}
function courseMap() {
  const m = {};
  STATE.courses.forEach(c => m[c.id] = c);
  return m;
}
function gradeColor(g) {
  return g >= 80 ? 'var(--green)' : g >= 70 ? 'var(--gold)' : 'var(--red)';
}
function letterGrade(g) {
  if (g >= 93) return 'A'; if (g >= 90) return 'A−'; if (g >= 87) return 'B+';
  if (g >= 83) return 'B'; if (g >= 80) return 'B−'; if (g >= 77) return 'C+';
  if (g >= 73) return 'C'; if (g >= 70) return 'C−'; return 'D/F';
}
const TYPE_COLORS = {
  'Problem Set':'var(--blue)','Coding':'var(--accent)','Essay':'var(--gold)',
  'Exam':'var(--red)','Quiz':'#e879f9','Lab Report':'var(--green)',
  'Reading':'var(--muted)','Project':'#f97316'
};

// ── DASHBOARD ─────────────────────────────────────────────────────────
function renderDashboard(el) {
  const { stats, assignments, courses } = STATE;
  const active   = assignments.filter(a => a.status !== 'Completed');
  const upcoming = [...active].sort((a,b) => a.days_until - b.days_until).slice(0, 6);
  const urgent   = active.filter(a => a.days_until <= 3);
  const cm       = courseMap();

  el.innerHTML = `
  <div class="topbar">
    <div class="page-title">Good morning, <span>${window.USER_NAME.split(' ')[0]}</span> 👋</div>
    <div class="chip">${new Date().toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'})}</div>
  </div>
  <div class="content">
    <div class="grid-4 mb-20">
      <div class="card-sm">
        <div class="stat-label">Active Tasks</div>
        <div class="stat-big" style="color:var(--accent);margin-top:6px">${stats.active}</div>
        <div style="font-size:11px;color:var(--muted);margin-top:3px">${stats.urgent} urgent</div>
      </div>
      <div class="card-sm">
        <div class="stat-label">Avg Grade</div>
        <div class="stat-big" style="color:var(--green);margin-top:6px">${stats.avg_grade || '—'}%</div>
        <div style="font-size:11px;color:var(--muted);margin-top:3px">across completed tasks</div>
      </div>
      <div class="card-sm">
        <div class="stat-label">Hours Needed</div>
        <div class="stat-big" style="color:var(--gold);margin-top:6px">${stats.total_pending_hours?.toFixed(1)}h</div>
        <div style="font-size:11px;color:var(--muted);margin-top:3px">estimated total</div>
      </div>
      <div class="card-sm">
        <div class="stat-label">Courses</div>
        <div class="stat-big" style="color:var(--blue);margin-top:6px">${courses.length}</div>
        <div style="font-size:11px;color:var(--muted);margin-top:3px">this semester</div>
      </div>
    </div>
    <div class="grid-2 mb-16">
      <div class="card">
        <div class="card-title">📋 Upcoming Deadlines</div>
        ${upcoming.length === 0 ? '<div style="color:var(--muted);font-size:13px">🎉 All caught up!</div>' :
          upcoming.map(a => `
          <div class="assignment-row" onclick="goto('assignments')" style="margin-bottom:7px">
            <div style="width:8px;height:8px;border-radius:50%;background:${cm[a.course_id]?.color || '#6c63ff'};flex-shrink:0"></div>
            <div style="flex:1;min-width:0">
              <div style="font-size:13px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${a.title}</div>
              <div style="font-size:11px;color:var(--muted)">${a.course_code} · ${a.type}</div>
            </div>
            ${dueChip(a)}
          </div>`).join('')}
      </div>
      <div class="card">
        <div class="card-title">📊 Course Health</div>
        ${courses.map(c => `
        <div style="margin-bottom:14px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px">
            <div style="display:flex;align-items:center;gap:8px">
              <div style="width:8px;height:8px;border-radius:50%;background:${c.color}"></div>
              <span style="font-size:13px;font-weight:500">${c.name}</span>
            </div>
            <span style="font-size:13px;font-weight:600;color:${gradeColor(c.current_grade)}">${c.current_grade}%</span>
          </div>
          <div class="progress-bar"><div class="progress-fill" style="width:${c.current_grade}%;background:${c.color}"></div></div>
        </div>`).join('')}
      </div>
    </div>
    ${urgent.length > 0 ? `
    <div style="background:#ff5f6d0a;border:1px solid #ff5f6d33;border-radius:12px;padding:16px">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;color:var(--red);font-family:'Syne',sans-serif;font-weight:700;font-size:13px">
        ⚠ URGENT — Due Within 3 Days
      </div>
      ${urgent.map(a => `
      <div style="display:flex;align-items:center;gap:12px;padding:8px 0;border-bottom:1px solid var(--border)">
        ${dueChip(a)}
        <span style="flex:1;font-size:13px">${a.title}</span>
        <span style="font-size:11px;color:var(--muted)">${a.est_hours}h needed</span>
        <span class="badge" style="background:#ff5f6d18;color:var(--red)">High Priority</span>
      </div>`).join('')}
    </div>` : ''}
  </div>`;
}

// ── ASSIGNMENTS ───────────────────────────────────────────────────────
let aFilter = 'All';
function renderAssignments(el) {
  const cm = courseMap();
  const filteredA = STATE.assignments.filter(a => {
    if (aFilter === 'All') return true;
    if (aFilter === 'Active') return a.status !== 'Completed';
    if (aFilter === 'Completed') return a.status === 'Completed';
    return String(a.course_id) === String(aFilter);
  });
  const sorted = [...filteredA].sort((a,b) => a.days_until - b.days_until);

  el.innerHTML = `
  <div class="topbar">
    <div class="page-title">Assignments</div>
    <button class="btn btn-primary" onclick="openAssignmentModal()">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      New Assignment
    </button>
  </div>
  <div class="content">
    <div class="tab-bar">
      ${['All','Active','Completed'].map(f => `<button class="tab ${aFilter===f?'active':''}" onclick="setAFilter('${f}')">${f}</button>`).join('')}
      ${STATE.courses.map(c => `<button class="tab ${aFilter==c.id?'active':''}" onclick="setAFilter(${c.id})">${c.code}</button>`).join('')}
    </div>
    ${sorted.length === 0 ? '<div class="empty-state"><div class="empty-icon">📭</div><div>No assignments found</div></div>' :
      sorted.map(a => {
        const done = (a.subtasks||[]).filter(s=>s.done).length;
        const total = (a.subtasks||[]).length;
        const tc = TYPE_COLORS[a.type] || 'var(--muted)';
        return `
        <div class="assignment-row" onclick="openAssignmentModal(${a.id})">
          <div style="width:3px;height:38px;background:${cm[a.course_id]?.color||'#6c63ff'};border-radius:2px;flex-shrink:0"></div>
          <div style="flex:1;min-width:0">
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
              <span style="font-size:14px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${a.title}</span>
              <span style="font-size:11px;background:${tc}22;color:${tc};padding:2px 7px;border-radius:4px">${a.type}</span>
            </div>
            <div style="font-size:11px;color:var(--muted);margin-top:2px">
              ${a.course_code} · ${a.weight}% weight · ${a.est_hours}h est
              ${total > 0 ? `· <span style="color:${done===total?'var(--green)':'var(--muted)'}">${done}/${total} subtasks</span>` : ''}
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:8px;flex-shrink:0">
            ${dueChip(a)}
            ${a.grade !== null ? `<span style="font-size:12px;color:var(--green);font-family:'JetBrains Mono',monospace">${a.grade}%</span>` : ''}
            <button class="btn btn-danger" style="padding:5px 8px" onclick="event.stopPropagation();deleteAssignment(${a.id})">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
            </button>
          </div>
        </div>`;
      }).join('')}
  </div>`;
}

function setAFilter(f) { aFilter = f; renderAssignments(document.getElementById('page-container')); }

async function deleteAssignment(id) {
  if (!confirm('Delete this assignment?')) return;
  await fetch(`/api/assignments/${id}`, { method: 'DELETE' });
  toast('Assignment deleted');
  await initPage('assignments');
}

let editSubtasks = [];

function openAssignmentModal(id) {
  const a  = id ? STATE.assignments.find(x => x.id === id) : null;
  const cm = courseMap();
  editSubtasks = a ? [...(a.subtasks || [])] : [];

  const courseOpts = STATE.courses.map(c => `<option value="${c.id}" ${a?.course_id==c.id?'selected':''}>${c.name}</option>`).join('');
  const typeOpts   = ['Problem Set','Coding','Essay','Exam','Quiz','Lab Report','Reading','Project'].map(t => `<option ${a?.type===t?'selected':''}>${t}</option>`).join('');
  const statusOpts = ['Not Started','In Progress','Completed'].map(s => `<option ${a?.status===s?'selected':''}>${s}</option>`).join('');
  const today8     = new Date(); today8.setDate(today8.getDate()+7);
  const defDate    = today8.toISOString().split('T')[0];

  openModal(
    a ? 'Edit Assignment' : 'New Assignment',
    `<div class="form-row mb-12"><div>
       <label class="label">Title</label>
       <input class="input" id="f-title" value="${a?.title||''}" placeholder="Assignment title">
     </div></div>
     <div class="form-row col-2 mb-12">
       <div><label class="label">Course</label><select class="input" id="f-course">${courseOpts}</select></div>
       <div><label class="label">Type</label><select class="input" id="f-type">${typeOpts}</select></div>
     </div>
     <div class="form-row col-3 mb-12">
       <div><label class="label">Due Date</label><input type="date" class="input" id="f-due" value="${a?.due_date||defDate}"></div>
       <div><label class="label">Weight (%)</label><input type="number" class="input" id="f-weight" value="${a?.weight||10}"></div>
       <div><label class="label">Est. Hours</label><input type="number" class="input" id="f-hours" value="${a?.est_hours||2}" step="0.5"></div>
     </div>
     <div class="form-row col-2 mb-12">
       <div><label class="label">Status</label><select class="input" id="f-status" onchange="toggleGradeField()">${statusOpts}</select></div>
       <div id="grade-field" style="${a?.status==='Completed'?'':'display:none'}">
         <label class="label">Grade (%)</label><input type="number" class="input" id="f-grade" value="${a?.grade||''}" placeholder="e.g. 88">
       </div>
     </div>
     <div class="mb-12"><label class="label">Notes</label><textarea class="input" id="f-notes">${a?.notes||''}</textarea></div>
     <div class="divider"></div>
     <label class="label" style="margin-bottom:8px">Subtasks</label>
     <div id="subtask-list">${renderSubtaskList()}</div>
     <div style="display:flex;gap:8px;margin-top:8px">
       <input class="input" id="new-subtask" placeholder="Add subtask..." style="flex:2" onkeydown="if(event.key==='Enter')addSubtaskUI()">
       <input class="input" id="new-assignee" placeholder="Assignee" style="flex:1">
       <button class="btn btn-ghost" onclick="addSubtaskUI()">+</button>
     </div>`,
    `<button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
     <button class="btn btn-primary" onclick="saveAssignment(${id||'null'})">Save Assignment</button>`
  );
}

function renderSubtaskList() {
  return editSubtasks.map((s,i) => `
  <div class="subtask-row">
    <div class="checkbox ${s.done?'checked':''}" onclick="toggleSubtaskUI(${i})">
      ${s.done?'<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>':''}
    </div>
    <span style="flex:1;font-size:13px;${s.done?'text-decoration:line-through;color:var(--muted)':''}">${s.title}${s.assignee?` <span style="font-size:11px;color:var(--muted)">(${s.assignee})</span>`:''}</span>
    <button class="btn btn-ghost" style="padding:3px 6px" onclick="removeSubtaskUI(${i})">
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
    </button>
  </div>`).join('');
}

function toggleGradeField() {
  const s = document.getElementById('f-status').value;
  document.getElementById('grade-field').style.display = s === 'Completed' ? '' : 'none';
}

function toggleSubtaskUI(i) {
  editSubtasks[i].done = !editSubtasks[i].done;
  document.getElementById('subtask-list').innerHTML = renderSubtaskList();
}
function removeSubtaskUI(i) {
  editSubtasks.splice(i, 1);
  document.getElementById('subtask-list').innerHTML = renderSubtaskList();
}
function addSubtaskUI() {
  const t = document.getElementById('new-subtask').value.trim();
  const a = document.getElementById('new-assignee').value.trim();
  if (!t) return;
  editSubtasks.push({ title: t, done: false, assignee: a });
  document.getElementById('subtask-list').innerHTML = renderSubtaskList();
  document.getElementById('new-subtask').value = '';
  document.getElementById('new-assignee').value = '';
}

async function saveAssignment(id) {
  const data = {
    course_id: parseInt(document.getElementById('f-course').value),
    title:     document.getElementById('f-title').value,
    type:      document.getElementById('f-type').value,
    due_date:  document.getElementById('f-due').value,
    weight:    parseFloat(document.getElementById('f-weight').value),
    est_hours: parseFloat(document.getElementById('f-hours').value),
    status:    document.getElementById('f-status').value,
    grade:     document.getElementById('f-grade') ? (parseFloat(document.getElementById('f-grade').value)||null) : null,
    notes:     document.getElementById('f-notes').value,
    subtasks:  editSubtasks,
  };
  if (!data.title.trim()) { toast('Title is required'); return; }
  if (id) {
    await fetch(`/api/assignments/${id}`, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(data) });
    toast('Assignment updated!');
  } else {
    await fetch('/api/assignments', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(data) });
    toast('Assignment added!');
  }
  closeModal();
  await initPage('assignments');
}

// ── COURSES ───────────────────────────────────────────────────────────
function renderCourses(el) {
  const cm = courseMap();
  el.innerHTML = `
  <div class="topbar">
    <div class="page-title">Courses</div>
    <button class="btn btn-primary" onclick="openCourseModal()">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      Add Course
    </button>
  </div>
  <div class="content">
    <div class="grid-2">
      ${STATE.courses.map(c => {
        const cas     = STATE.assignments.filter(a => a.course_id === c.id);
        const pending = cas.filter(a => a.status !== 'Completed').length;
        return `
        <div class="card" style="border-left:3px solid ${c.color}">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px">
            <div>
              <div style="font-family:'Syne',sans-serif;font-weight:700;font-size:16px">${c.name}</div>
              <div style="color:var(--muted);font-size:12px;margin-top:2px">${c.code} · ${c.credits} credits</div>
            </div>
            <div style="display:flex;gap:6px">
              <button class="btn btn-ghost btn-sm" onclick="openCourseModal(${c.id})">Edit</button>
              <button class="btn btn-danger btn-sm" onclick="deleteCourse(${c.id})">Delete</button>
            </div>
          </div>
          <div class="grid-3" style="gap:10px;margin-bottom:14px">
            <div style="text-align:center">
              <div style="font-size:22px;font-family:'Syne',sans-serif;font-weight:700;color:${gradeColor(c.current_grade)}">${c.current_grade}%</div>
              <div style="font-size:11px;color:var(--muted)">Current Grade</div>
            </div>
            <div style="text-align:center">
              <div style="font-size:22px;font-family:'Syne',sans-serif;font-weight:700;color:var(--blue)">${cas.length}</div>
              <div style="font-size:11px;color:var(--muted)">Total Tasks</div>
            </div>
            <div style="text-align:center">
              <div style="font-size:22px;font-family:'Syne',sans-serif;font-weight:700;color:var(--gold)">${pending}</div>
              <div style="font-size:11px;color:var(--muted)">Pending</div>
            </div>
          </div>
          <div class="divider"></div>
          <div style="font-size:12px;color:var(--muted)">
            Weights: <span style="color:var(--text)">Assignments ${c.grade_weight.assignments}%</span> · 
            <span style="color:var(--text)">Midterm ${c.grade_weight.midterm}%</span> · 
            <span style="color:var(--text)">Final ${c.grade_weight.final}%</span>
          </div>
        </div>`;
      }).join('')}
    </div>
  </div>`;
}

function openCourseModal(id) {
  const c = id ? STATE.courses.find(x => x.id === id) : null;
  openModal(
    c ? 'Edit Course' : 'Add Course',
    `<div class="form-row col-2 mb-12">
       <div><label class="label">Course Name</label><input class="input" id="cf-name" value="${c?.name||''}" placeholder="e.g. Linear Algebra"></div>
       <div><label class="label">Code</label><input class="input" id="cf-code" value="${c?.code||''}" placeholder="e.g. MATH201"></div>
     </div>
     <div class="form-row col-3 mb-12">
       <div><label class="label">Credits</label><input type="number" class="input" id="cf-credits" value="${c?.credits||3}"></div>
       <div><label class="label">Current Grade</label><input type="number" class="input" id="cf-grade" value="${c?.current_grade||80}"></div>
       <div><label class="label">Color</label><input type="color" class="input" id="cf-color" value="${c?.color||'#6c63ff'}" style="padding:4px;height:38px"></div>
     </div>
     <label class="label" style="margin-bottom:8px">Grade Weights (%)</label>
     <div class="form-row col-3">
       <div><label class="label">Assignments</label><input type="number" class="input" id="cf-wa" value="${c?.grade_weight?.assignments||40}"></div>
       <div><label class="label">Midterm</label><input type="number" class="input" id="cf-wm" value="${c?.grade_weight?.midterm||25}"></div>
       <div><label class="label">Final</label><input type="number" class="input" id="cf-wf" value="${c?.grade_weight?.final||35}"></div>
     </div>`,
    `<button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
     <button class="btn btn-primary" onclick="saveCourse(${id||'null'})">Save Course</button>`
  );
}

async function saveCourse(id) {
  const data = {
    name: document.getElementById('cf-name').value,
    code: document.getElementById('cf-code').value,
    credits: parseInt(document.getElementById('cf-credits').value),
    current_grade: parseFloat(document.getElementById('cf-grade').value),
    color: document.getElementById('cf-color').value,
    grade_weight: {
      assignments: parseFloat(document.getElementById('cf-wa').value),
      midterm: parseFloat(document.getElementById('cf-wm').value),
      final: parseFloat(document.getElementById('cf-wf').value),
    }
  };
  if (!data.name.trim()) { toast('Course name required'); return; }
  if (id) {
    await fetch(`/api/courses/${id}`, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(data) });
    toast('Course updated!');
  } else {
    await fetch('/api/courses', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(data) });
    toast('Course added!');
  }
  closeModal();
  await initPage('courses');
}

async function deleteCourse(id) {
  if (!confirm('Delete this course and all its assignments?')) return;
  await fetch(`/api/courses/${id}`, { method: 'DELETE' });
  toast('Course deleted');
  await initPage('courses');
}

// ── AI PRIORITY ───────────────────────────────────────────────────────
let aiRankings = null;
function renderAIPriority(el) {
  el.innerHTML = `
  <div class="topbar">
    <div class="page-title"><span>AI</span> Priority Ranking</div>
    <button class="btn btn-primary" id="ai-btn" onclick="generateAIPriority()">
      ✦ Generate Rankings
    </button>
  </div>
  <div class="content" id="ai-content">
    ${aiRankings ? renderRankings(aiRankings) : `
    <div class="ai-card" style="text-align:center;padding:56px 24px">
      <div style="font-size:48px;margin-bottom:16px">🧠</div>
      <div style="font-family:'Syne',sans-serif;font-size:20px;font-weight:700;margin-bottom:8px">AI-Powered Priority Analysis</div>
      <div style="color:var(--muted);font-size:14px;margin-bottom:24px;max-width:400px;margin:0 auto 24px">
        Click Generate to have AI analyze your ${STATE.assignments.filter(a=>a.status!=='Completed').length} active assignments and rank them with written reasoning
      </div>
      <button class="btn btn-primary" onclick="generateAIPriority()" style="margin:0 auto">✦ Generate Rankings</button>
    </div>`}
  </div>`;
}

function renderRankings(rankings) {
  return rankings.map((r, i) => {
    const pc = priorityColor(r.priority);
    return `
    <div class="priority-rank" style="background:${pc}18;border-color:${pc}44">
      <div class="rank-num" style="background:${pc}22;color:${pc}">#${i+1}</div>
      <div style="width:3px;height:40px;background:${r.course_color};border-radius:2px;flex-shrink:0"></div>
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <span style="font-size:14px;font-weight:600">${r.title}</span>
          <span class="badge" style="background:${pc}18;color:${pc}">${r.priority}</span>
          <span style="font-size:11px;color:var(--muted)">${r.course_code} · Due ${fmt(r.due_date)}</span>
        </div>
        <div style="font-size:13px;color:var(--muted);margin-top:6px;line-height:1.6">${r.reasoning}</div>
      </div>
      <div style="text-align:right;flex-shrink:0;min-width:70px">
        <div style="font-family:'JetBrains Mono',monospace;font-size:22px;font-weight:500;color:${pc}">${r.urgency}<span style="font-size:11px">/10</span></div>
        <div style="font-size:11px;color:var(--muted)">urgency</div>
        ${r.suggested_hours_today ? `<div style="font-size:11px;color:var(--gold);margin-top:4px">${r.suggested_hours_today}h today</div>` : ''}
      </div>
    </div>`;
  }).join('');
}

async function generateAIPriority() {
  const btn = document.getElementById('ai-btn');
  const content = document.getElementById('ai-content');
  btn.disabled = true;
  btn.innerHTML = '<div class="dot-pulse"><span></span><span></span><span></span></div>&nbsp;Analyzing...';
  content.innerHTML = `
  <div class="ai-card" style="padding:40px;text-align:center">
    <div class="dot-pulse" style="justify-content:center;margin-bottom:12px"><span></span><span></span><span></span></div>
    <div style="color:var(--accent);font-family:'Syne',sans-serif;font-weight:600">Analyzing ${STATE.assignments.filter(a=>a.status!=='Completed').length} assignments...</div>
    <div style="color:var(--muted);font-size:13px;margin-top:8px">Considering deadlines, weights, complexity & your workload</div>
  </div>`;
  try {
    const r = await fetch('/api/ai/priority', { method: 'POST', headers: {'Content-Type':'application/json'} });
    aiRankings = await r.json();
    content.innerHTML = renderRankings(aiRankings);
    toast('AI rankings ready!');
  } catch { toast('Analysis failed. Try again.'); }
  btn.disabled = false;
  btn.innerHTML = '✦ Regenerate';
}

// ── STUDY PLAN ────────────────────────────────────────────────────────
let studyPlan = null;
function renderStudyPlan(el) {
  el.innerHTML = `
  <div class="topbar">
    <div class="page-title">Day-by-Day <span>Study Plan</span></div>
    <div style="display:flex;gap:12px;align-items:center">
      <div style="display:flex;align-items:center;gap:8px">
        <span style="font-size:13px;color:var(--muted)">Free hrs/day:</span>
        <input type="number" class="input" id="free-hrs" value="4" style="width:64px" min="1" max="14">
      </div>
      <button class="btn btn-primary" onclick="generateStudyPlan()">✦ Generate Plan</button>
    </div>
  </div>
  <div class="content" id="study-content">
    ${studyPlan ? renderPlan(studyPlan) : `
    <div class="ai-card" style="text-align:center;padding:56px 24px">
      <div style="font-size:48px;margin-bottom:16px">📅</div>
      <div style="font-family:'Syne',sans-serif;font-size:20px;font-weight:700;margin-bottom:8px">Smart Study Schedule</div>
      <div style="color:var(--muted);font-size:14px;margin-bottom:24px">AI fills your free time blocks intelligently based on urgency and effort</div>
      <button class="btn btn-primary" onclick="generateStudyPlan()" style="margin:0 auto">✦ Generate 7-Day Plan</button>
    </div>`}
  </div>`;
}

function renderPlan(plan) {
  return `<div class="grid-2">${(plan.days||[]).map(day => `
  <div class="study-day">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
      <div style="font-family:'Syne',sans-serif;font-weight:700;font-size:14px">${day.day_label}</div>
      <span class="chip">${day.total_hours?.toFixed(1)}h planned</span>
    </div>
    ${!day.blocks?.length ? '<div style="font-size:12px;color:var(--muted);padding:6px 0">🎉 Free day!</div>' :
      day.blocks.map(b => `
      <div class="study-block">
        <div class="color-dot" style="background:${b.course_color||'var(--accent)'}"></div>
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${b.task}</div>
          <div style="font-size:11px;color:var(--muted)">${b.course} · ${b.note}</div>
        </div>
        <span class="chip">${b.hours}h</span>
      </div>`).join('')}
  </div>`).join('')}</div>`;
}

async function generateStudyPlan() {
  const freeHrs = parseFloat(document.getElementById('free-hrs')?.value || 4);
  const content = document.getElementById('study-content');
  content.innerHTML = '<div class="ai-card" style="padding:32px;text-align:center;color:var(--accent)">✦ Building your optimal study schedule...</div>';
  const r = await fetch('/api/ai/study-plan', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({free_hours: freeHrs}) });
  studyPlan = await r.json();
  content.innerHTML = renderPlan(studyPlan);
  toast('Study plan generated!');
}

// ── GRADE SIMULATOR ───────────────────────────────────────────────────
let selectedCourseId = null;
let gradeScores = {};

function renderGradeSimulator(el) {
  if (!selectedCourseId && STATE.courses.length) selectedCourseId = STATE.courses[0].id;
  const course      = STATE.courses.find(c => c.id === selectedCourseId);
  const cas         = STATE.assignments.filter(a => a.course_id === selectedCourseId);
  const pending     = cas.filter(a => a.status !== 'Completed');
  const completed   = cas.filter(a => a.status === 'Completed' && a.grade !== null);
  const totalWeight = cas.reduce((s,a) => s + a.weight, 0);

  let earned = completed.reduce((s,a) => s + (a.grade/100)*a.weight, 0);
  pending.forEach(a => {
    const sc = gradeScores[a.id] !== undefined ? gradeScores[a.id] : 75;
    earned += (sc/100)*a.weight;
  });
  const sim    = totalWeight > 0 ? ((earned/totalWeight)*100) : 0;
  const letter = letterGrade(sim);
  const lc     = gradeColor(sim);

  el.innerHTML = `
  <div class="topbar">
    <div class="page-title">Grade <span>Simulator</span></div>
    <select class="input" style="width:220px" onchange="selectGradeCourse(this.value)">
      ${STATE.courses.map(c => `<option value="${c.id}" ${c.id===selectedCourseId?'selected':''}>${c.name}</option>`).join('')}
    </select>
  </div>
  <div class="content">
    <div class="grid-2 mb-16">
      <div class="card" style="text-align:center">
        <div style="font-size:12px;color:var(--muted);margin-bottom:8px">CURRENT GRADE</div>
        <div class="stat-big" style="color:${gradeColor(course?.current_grade||0)};font-size:52px">${course?.current_grade||0}%</div>
        <div style="font-size:14px;color:var(--muted);margin-top:4px">${letterGrade(course?.current_grade||0)}</div>
      </div>
      <div class="card" style="text-align:center;background:linear-gradient(135deg,#1a1440,var(--surface));border-color:var(--accent-glow)">
        <div style="font-size:12px;color:var(--accent);margin-bottom:8px">PROJECTED FINAL</div>
        <div class="stat-big" style="color:${lc};font-size:52px">${sim.toFixed(1)}%</div>
        <div style="font-size:14px;color:${lc};margin-top:4px">${letter}</div>
      </div>
    </div>
    <div class="card mb-16">
      <div class="card-title">📈 Adjust Pending Assignment Scores</div>
      ${pending.length === 0 ? '<div style="color:var(--muted);font-size:13px">All assignments completed! ✓</div>' :
        pending.map(a => {
          const sc = gradeScores[a.id] !== undefined ? gradeScores[a.id] : 75;
          return `
          <div style="margin-bottom:20px">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:7px">
              <div>
                <span style="font-size:13px;font-weight:500">${a.title}</span>
                <span style="font-size:11px;color:var(--muted);margin-left:8px">${a.weight}% weight · Due ${fmt(a.due_date)}</span>
              </div>
              <span style="font-family:'Syne',sans-serif;font-weight:700;font-size:20px;color:var(--accent)" id="sc-val-${a.id}">${sc}%</span>
            </div>
            <input type="range" class="score-slider" min="0" max="100" value="${sc}" oninput="updateScore(${a.id}, this.value)">
            <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--dim);margin-top:2px">
              <span>0%</span><span>25%</span><span>50%</span><span>75%</span><span>100%</span>
            </div>
          </div>`;
        }).join('')}
      ${completed.length > 0 ? `
      <div class="divider"></div>
      <div style="font-size:12px;color:var(--muted);margin-bottom:8px">Completed (${completed.length})</div>
      ${completed.map(a => `
      <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border);font-size:13px">
        <span style="color:var(--muted);text-decoration:line-through">${a.title}</span>
        <span style="color:var(--green)">${a.grade}%</span>
      </div>`).join('')}` : ''}
    </div>
    <div class="card" style="background:linear-gradient(135deg,#0a1a0a,var(--surface));border-color:#2dd4a033">
      <div style="font-family:'Syne',sans-serif;font-weight:700;margin-bottom:12px">🎯 What score do I need?</div>
      ${[{target:90,label:'A (90%+)'},{target:85,label:'B+ (85%+)'},{target:80,label:'B (80%+)'}].map(({target,label}) => {
        const needed = pending.reduce((s,a) => s+a.weight, 0) > 0
          ? ((target/100*totalWeight - completed.reduce((s,a) => s+(a.grade/100)*a.weight, 0)) / pending.reduce((s,a) => s+a.weight, 0) * 100).toFixed(1)
          : null;
        const feasible = needed !== null && parseFloat(needed) <= 100 && parseFloat(needed) >= 0;
        return `
        <div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border)">
          <span style="font-size:13px">To get ${label}</span>
          <span style="font-weight:600;color:${feasible?'var(--green)':'var(--red)'}">
            ${needed === null ? 'N/A' : feasible ? `Avg ${needed}% on remaining` : `Not achievable (needs ${needed}%)`}
          </span>
        </div>`;
      }).join('')}
    </div>
  </div>`;
}

function selectGradeCourse(id) {
  selectedCourseId = parseInt(id);
  gradeScores = {};
  renderGradeSimulator(document.getElementById('page-container'));
}

function updateScore(aid, val) {
  gradeScores[aid] = parseInt(val);
  document.getElementById(`sc-val-${aid}`).textContent = val + '%';
  // recalculate sim grade live
  const course      = STATE.courses.find(c => c.id === selectedCourseId);
  const cas         = STATE.assignments.filter(a => a.course_id === selectedCourseId);
  const pending     = cas.filter(a => a.status !== 'Completed');
  const completed   = cas.filter(a => a.status === 'Completed' && a.grade !== null);
  const totalWeight = cas.reduce((s,a) => s + a.weight, 0);
  let earned = completed.reduce((s,a) => s + (a.grade/100)*a.weight, 0);
  pending.forEach(a => { earned += ((gradeScores[a.id]||75)/100)*a.weight; });
  const sim    = totalWeight > 0 ? ((earned/totalWeight)*100) : 0;
  const lc     = gradeColor(sim);
  const projected = document.querySelector('.stat-big[style*="52px"]');
  if(projected) projected.style.color = lc;
}

// ── COLLISION DETECTOR ─────────────────────────────────────────────────
function renderCollision(el) {
  el.innerHTML = `
  <div class="topbar">
    <div class="page-title">Collision <span>Detector</span></div>
    <button class="btn btn-primary" onclick="runCollision()">⚡ Analyze Deadlines</button>
  </div>
  <div class="content" id="collision-content">
    <div class="ai-card" style="text-align:center;padding:56px 24px">
      <div style="font-size:48px;margin-bottom:16px">⚡</div>
      <div style="font-family:'Syne',sans-serif;font-size:20px;font-weight:700;margin-bottom:8px">Deadline Collision Detector</div>
      <div style="color:var(--muted);font-size:14px;margin-bottom:24px">Finds days with multiple deadlines or 6h+ workload and suggests early-finish strategies</div>
      <button class="btn btn-primary" onclick="runCollision()" style="margin:0 auto">⚡ Run Analysis</button>
    </div>
  </div>`;
}

async function runCollision() {
  const content = document.getElementById('collision-content');
  content.innerHTML = '<div style="padding:20px;color:var(--muted)">Analyzing...</div>';
  const r           = await fetch('/api/collisions');
  const collisions  = await r.json();
  const active      = STATE.assignments.filter(a => a.status !== 'Completed');

  content.innerHTML = `
  <div class="grid-2 mb-16">
    <div class="card-sm" style="border-color:${collisions.length?'var(--red)44':'var(--green)44'}">
      <div class="stat-big" style="color:${collisions.length?'var(--red)':'var(--green)'}">${collisions.length}</div>
      <div class="stat-label">Collision Days Found</div>
    </div>
    <div class="card-sm">
      <div class="stat-big" style="color:var(--blue)">${active.length}</div>
      <div class="stat-label">Active Assignments Scanned</div>
    </div>
  </div>
  ${collisions.length === 0 ? `
  <div class="card" style="text-align:center;padding:36px;border-color:var(--green)44">
    <div style="font-size:36px;margin-bottom:12px">🎉</div>
    <div style="font-family:'Syne',sans-serif;font-weight:700;color:var(--green)">No Collisions Detected!</div>
    <div style="color:var(--muted);margin-top:8px">Your deadlines are well-spaced.</div>
  </div>` :
  collisions.map(c => `
  <div class="collision-item">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
      <div style="display:flex;align-items:center;gap:8px;color:var(--red);font-family:'Syne',sans-serif;font-weight:700">
        ⚠ ${new Date(c.date+'T12:00:00').toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'})}
      </div>
      <span class="badge" style="background:#ff5f6d18;color:var(--red)">${c.items.length} tasks · ${c.total_hours}h total</span>
    </div>
    ${c.items.map(a => `
    <div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border)">
      <div class="color-dot" style="background:${a.course_color}"></div>
      <span style="flex:1;font-size:13px">${a.title}</span>
      <span style="font-size:11px;color:var(--muted)">${a.course_code} · ${a.est_hours}h</span>
    </div>`).join('')}
    ${c.suggestions.length ? `
    <div style="margin-top:10px;padding:10px;background:var(--surface-high);border-radius:6px">
      <div style="font-size:11px;color:var(--gold);font-weight:600;margin-bottom:6px">💡 EARLY-FINISH SUGGESTIONS</div>
      ${c.suggestions.map(s => `<div style="font-size:12px;color:var(--muted);margin-bottom:3px">→ ${s}</div>`).join('')}
    </div>` : ''}
  </div>`).join('')}`;
  toast(`Found ${collisions.length} collision(s)`);
}

// ── GROUP COORDINATOR ──────────────────────────────────────────────────
let selectedGroupId = null;
function renderGroup(el) {
  const projects = STATE.assignments.filter(a => a.type === 'Project' || (a.subtasks||[]).length > 0);
  const selected = selectedGroupId ? STATE.assignments.find(a => a.id === selectedGroupId) : null;
  const cm       = courseMap();

  el.innerHTML = `
  <div class="topbar"><div class="page-title">Group <span>Project Coordinator</span></div></div>
  <div class="content">
    <div class="grid-2">
      <div>
        <div class="card-title mb-12">SELECT PROJECT</div>
        ${projects.length === 0 ? `<div class="empty-state"><div class="empty-icon">👥</div><div>No projects yet. Add assignments with subtasks.</div></div>` :
          projects.map(a => {
            const done  = (a.subtasks||[]).filter(s=>s.done).length;
            const total = (a.subtasks||[]).length;
            return `
            <div class="assignment-row" style="border-color:${selectedGroupId===a.id?'var(--accent)':'var(--border)'}" onclick="selectGroup(${a.id})">
              <div style="width:3px;height:36px;background:${cm[a.course_id]?.color||'#6c63ff'};border-radius:2px"></div>
              <div style="flex:1;min-width:0">
                <div style="font-size:13px;font-weight:500">${a.title}</div>
                <div style="font-size:11px;color:var(--muted)">${a.course_code} · Due ${fmt(a.due_date)}</div>
              </div>
              <div style="text-align:right">
                <div style="font-size:12px;color:${done===total&&total>0?'var(--green)':'var(--gold)'}">${done}/${total}</div>
                <div style="font-size:10px;color:var(--muted)">tasks</div>
              </div>
            </div>`;
          }).join('')}
      </div>
      <div id="group-detail">
        ${selected ? renderGroupDetail(selected) : '<div class="card"><div style="color:var(--muted);text-align:center;padding:32px">Select a project to manage subtasks</div></div>'}
      </div>
    </div>
  </div>`;
}

function renderGroupDetail(a) {
  const done  = (a.subtasks||[]).filter(s=>s.done).length;
  const total = (a.subtasks||[]).length;
  const pct   = total > 0 ? Math.round(done/total*100) : 0;
  return `
  <div class="card">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
      <div style="font-family:'Syne',sans-serif;font-weight:700;font-size:15px">${a.title}</div>
      <button class="btn btn-primary btn-sm" onclick="aiSubtasks(${a.id})">✦ AI Breakdown</button>
    </div>
    <div style="margin-bottom:12px">
      <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--muted);margin-bottom:4px">
        <span>Progress</span><span>${done}/${total} (${pct}%)</span>
      </div>
      <div class="progress-bar"><div class="progress-fill" style="width:${pct}%;background:var(--green)"></div></div>
    </div>
    <div id="subtasks-ui">
      ${(a.subtasks||[]).map(s => `
      <div class="subtask-row">
        <div class="checkbox ${s.done?'checked':''}" onclick="toggleSubtaskServer(${s.id},${a.id})">
          ${s.done?'<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>':''}
        </div>
        <span style="flex:1;font-size:13px;${s.done?'text-decoration:line-through;color:var(--muted)':''}">${s.title}</span>
        ${s.assignee?`<span class="chip" style="font-size:10px">${s.assignee}</span>`:''}
      </div>`).join('')}
    </div>
    <div style="display:flex;gap:8px;margin-top:12px">
      <input class="input" id="gs-task" placeholder="Add subtask..." style="flex:2" onkeydown="if(event.key==='Enter')addGroupSubtask(${a.id})">
      <input class="input" id="gs-member" placeholder="Assignee" style="flex:1">
      <button class="btn btn-primary btn-sm" onclick="addGroupSubtask(${a.id})">+</button>
    </div>
  </div>`;
}

function selectGroup(id) {
  selectedGroupId = id;
  renderGroup(document.getElementById('page-container'));
}

async function toggleSubtaskServer(sid, aid) {
  await fetch(`/api/subtasks/${sid}/toggle`, { method: 'POST' });
  await loadData();
  const a = STATE.assignments.find(x => x.id === aid);
  if (a) document.getElementById('group-detail').innerHTML = renderGroupDetail(a);
}

async function addGroupSubtask(aid) {
  const title  = document.getElementById('gs-task').value.trim();
  const assignee = document.getElementById('gs-member').value.trim();
  if (!title) return;
  const a = STATE.assignments.find(x => x.id === aid);
  const updated = { ...a, subtasks: [...(a.subtasks||[]), { title, done: false, assignee }] };
  await fetch(`/api/assignments/${aid}`, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(updated) });
  toast('Subtask added!');
  await loadData();
  const fresh = STATE.assignments.find(x => x.id === aid);
  document.getElementById('group-detail').innerHTML = renderGroupDetail(fresh);
}

async function aiSubtasks(aid) {
  toast('AI generating subtasks...');
  const r    = await fetch('/api/ai/subtasks', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({assignment_id: aid}) });
  const data = await r.json();
  await loadData();
  const fresh = STATE.assignments.find(x => x.id === aid);
  if (fresh) document.getElementById('group-detail').innerHTML = renderGroupDetail(fresh);
  toast('AI subtasks generated!');
}

// ── CALENDAR ───────────────────────────────────────────────────────────
let gcalConnected = false;
let syncedIds = new Set();

function renderCalendar(el) {
  const active = STATE.assignments.filter(a => a.status !== 'Completed').sort((a,b) => a.days_until - b.days_until);
  el.innerHTML = `
  <div class="topbar">
    <div class="page-title">Google <span>Calendar Sync</span></div>
    ${gcalConnected ? '<button class="btn btn-primary" onclick="syncAll()">Sync All Assignments</button>' : ''}
  </div>
  <div class="content">
    <div class="gcal-banner mb-20">
      <div style="width:48px;height:48px;background:${gcalConnected?'var(--green)22':'var(--surface-high)'};border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:26px;flex-shrink:0">📆</div>
      <div style="flex:1">
        <div style="font-family:'Syne',sans-serif;font-weight:700;margin-bottom:4px">${gcalConnected?'Google Calendar Connected':'Connect Google Calendar'}</div>
        <div style="font-size:13px;color:var(--muted)">${gcalConnected?'Two-way sync active — deadlines appear in your calendar':'Sync deadlines as calendar events with reminders. Two-way sync keeps everything aligned.'}</div>
      </div>
      ${!gcalConnected ? `<button class="btn btn-primary" onclick="connectCal()">Connect Calendar</button>` :
        `<div class="badge" style="background:var(--green)22;color:var(--green);padding:7px 14px">● Connected</div>`}
    </div>
    ${gcalConnected ? `
    <div class="card">
      <div class="card-title">Assignments (${syncedIds.size}/${active.length} synced)</div>
      ${active.map(a => `
      <div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--border)">
        <div class="color-dot" style="background:${a.course_color}"></div>
        <div style="flex:1">
          <div style="font-size:13px;font-weight:500">${a.title}</div>
          <div style="font-size:11px;color:var(--muted)">${a.course_code} · ${fmt(a.due_date)}</div>
        </div>
        ${syncedIds.has(a.id) ?
          `<div class="badge" style="background:var(--green)22;color:var(--green)">✓ Synced</div>` :
          `<button class="btn btn-ghost btn-sm" onclick="syncOne(${a.id})">Sync</button>`}
      </div>`).join('')}
    </div>` : `
    <div class="grid-2">
      ${['Deadline reminders','Two-way sync','Color-coded by course','Recurring events'].map(f => `
      <div class="card-sm" style="display:flex;align-items:center;gap:12px">
        <div style="width:32px;height:32px;background:var(--accent-soft);border-radius:8px;display:flex;align-items:center;justify-content:center;color:var(--accent)">✓</div>
        <div style="font-size:13px">${f}</div>
      </div>`).join('')}
    </div>`}
  </div>`;
}

function connectCal() {
  const btn = document.querySelector('[onclick="connectCal()"]');
  if (btn) { btn.disabled = true; btn.textContent = 'Connecting...'; }
  setTimeout(() => {
    gcalConnected = true;
    renderCalendar(document.getElementById('page-container'));
    toast('Google Calendar connected!');
  }, 1800);
}

function syncAll() {
  const active = STATE.assignments.filter(a => a.status !== 'Completed');
  active.forEach(a => syncedIds.add(a.id));
  renderCalendar(document.getElementById('page-container'));
  toast(`Synced ${active.length} assignments!`);
}

function syncOne(id) {
  syncedIds.add(id);
  renderCalendar(document.getElementById('page-container'));
  toast('Event synced!');
}

// ── PRODUCTIVITY ──────────────────────────────────────────────────────
function renderProductivity(el) {
  const { assignments, stats } = STATE;
  const completed  = assignments.filter(a => a.status === 'Completed');
  const active     = assignments.filter(a => a.status !== 'Completed');
  const inProgress = assignments.filter(a => a.status === 'In Progress');
  const compRate   = assignments.length ? Math.round(completed.length/assignments.length*100) : 0;

  const byType = {};
  assignments.forEach(a => byType[a.type] = (byType[a.type]||0)+1);
  const byCourse = {};
  assignments.forEach(a => byCourse[a.course_code] = (byCourse[a.course_code]||0)+1);

  // 7-day load
  const today = new Date();
  const weekLoad = Array.from({length:7}, (_,i) => {
    const dt = new Date(today); dt.setDate(dt.getDate()+i);
    const iso = dt.toISOString().split('T')[0];
    const items = assignments.filter(a => a.due_date === iso);
    return { label: i===0?'Today':dt.toLocaleDateString('en-US',{weekday:'short'}), hours: items.reduce((s,a)=>s+a.est_hours,0), count: items.length };
  });
  const maxH = Math.max(...weekLoad.map(w=>w.hours), 1);

  const cm = courseMap();

  el.innerHTML = `
  <div class="topbar"><div class="page-title">Productivity <span>Dashboard</span></div></div>
  <div class="content">
    <div class="grid-4 mb-20">
      <div class="card-sm"><div class="stat-big" style="color:var(--green)">${compRate}%</div><div class="stat-label">Completion Rate</div></div>
      <div class="card-sm"><div class="stat-big" style="color:var(--blue)">${stats.avg_grade||'—'}%</div><div class="stat-label">Avg Grade</div></div>
      <div class="card-sm"><div class="stat-big" style="color:var(--accent)">${inProgress.length}</div><div class="stat-label">In Progress</div></div>
      <div class="card-sm"><div class="stat-big" style="color:var(--red)">${stats.urgent||0}</div><div class="stat-label">Urgent (≤3d)</div></div>
    </div>
    <div class="grid-2">
      <div class="card">
        <div class="card-title">📊 7-Day Deadline Load</div>
        <div class="chart-container">
          ${weekLoad.map(w => `
          <div class="chart-bar-item">
            <div class="chart-bar-fill ${w.hours>6?'danger':''}" style="height:${Math.round((w.hours/maxH)*80)+4}px" title="${w.hours}h"></div>
            <div class="chart-bar-label">${w.label}</div>
            ${w.count>0?`<div class="chart-bar-val">${w.count}</div>`:''}
          </div>`).join('')}
        </div>
      </div>
      <div class="card">
        <div class="card-title">✅ Status Overview</div>
        ${[{l:'Completed',c:completed.length,col:'var(--green)'},{l:'In Progress',c:inProgress.length,col:'var(--accent)'},{l:'Not Started',c:assignments.filter(a=>a.status==='Not Started').length,col:'var(--red)'}].map(s => `
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px">
          <div style="width:10px;height:10px;border-radius:50%;background:${s.col}"></div>
          <span style="flex:1;font-size:13px">${s.l}</span>
          <span style="font-family:'Syne',sans-serif;font-weight:700;font-size:18px;color:${s.col}">${s.c}</span>
          <div class="progress-bar" style="width:80px"><div class="progress-fill" style="width:${assignments.length?Math.round(s.c/assignments.length*100):0}%;background:${s.col}"></div></div>
        </div>`).join('')}
        <div class="divider"></div>
        <div style="font-size:13px;color:var(--muted);text-align:center">
          Overall completion: <strong style="color:var(--green)">${compRate}%</strong>
        </div>
      </div>
      <div class="card">
        <div class="card-title">📋 By Assignment Type</div>
        ${Object.entries(byType).sort((a,b)=>b[1]-a[1]).map(([type,count]) => `
        <div style="margin-bottom:10px">
          <div style="display:flex;justify-content:space-between;margin-bottom:4px">
            <span style="font-size:13px">${type}</span>
            <span style="font-size:12px;color:var(--muted)">${count}</span>
          </div>
          <div class="progress-bar"><div class="progress-fill" style="width:${Math.round(count/assignments.length*100)}%;background:var(--accent)"></div></div>
        </div>`).join('')}
      </div>
      <div class="card">
        <div class="card-title">🎓 Workload by Course</div>
        ${Object.entries(byCourse).sort((a,b)=>b[1]-a[1]).map(([code,count]) => {
          const course = Object.values(cm).find(c=>c.code===code);
          return `
          <div style="margin-bottom:10px">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
              <span style="font-size:13px;display:flex;align-items:center;gap:6px">
                <div class="color-dot" style="background:${course?.color||'var(--accent)'}"></div>${code}
              </span>
              <span style="font-size:12px;color:var(--muted)">${count} tasks</span>
            </div>
            <div class="progress-bar"><div class="progress-fill" style="width:${Math.round(count/assignments.length*100)}%;background:${course?.color||'var(--accent)'}"></div></div>
          </div>`;
        }).join('')}
      </div>
    </div>
  </div>`;
}
