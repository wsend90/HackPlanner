/* ============================================================
   UI MODULE v2 — Multi-project views
   ============================================================ */

const UI = (() => {
    const $ = id => document.getElementById(id);
    const $main = () => $('mainContent');
    let currentViewMode = 'grid'; // grid | list | kanban

    // ── TOAST ──
    function toast(msg, type = 'success') {
        const icons = { success: '✓', error: '✗', info: 'ℹ' };
        const el = document.createElement('div');
        el.className = `toast toast-${type}`;
        el.innerHTML = `<span>${icons[type] || '•'}</span> ${msg}`;
        $('toastContainer').appendChild(el);
        setTimeout(() => el.remove(), 3000);
    }

    // ── MODAL ──
    function openModal(title, html) { $('modalTitle').textContent = title; $('modalBody').innerHTML = html; $('modalOverlay').classList.add('active'); }
    function closeModal() { $('modalOverlay').classList.remove('active'); }

    function confirmDialog(title, message, onConfirm) {
        openModal(title, `
            <p style="color:var(--text-secondary);margin-bottom:var(--space-md);">${message}</p>
            <div class="confirm-actions">
                <button class="btn btn-secondary" id="confirmCancel">Cancelar</button>
                <button class="btn btn-primary" id="confirmOk" style="background:var(--neon-red);box-shadow:0 0 15px rgba(255,62,62,0.2);">Confirmar</button>
            </div>`);
        $('confirmCancel').addEventListener('click', closeModal);
        $('confirmOk').addEventListener('click', () => { closeModal(); onConfirm(); });
    }

    function setActiveNav(v) {
        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
        const el = document.querySelector(`[data-view="${v}"]`);
        if (el) el.classList.add('active');
    }

    // ── HELPERS ──
    function _uid() { return Date.now().toString(36) + Math.random().toString(36).substr(2, 5); }
    function _statusLabel(s) { return { pending:'Pendiente','in-progress':'En curso',completed:'Completado',delayed:'Atrasado',retest:'Retest',active:'Activo',paused:'Pausado' }[s] || s; }
    function _priorityLabel(p) { return { 1:'Alta', 2:'Media', 3:'Baja' }[p] || 'Media'; }
    function _fmtDate(d) { if (!d) return ''; const dt = new Date(d+'T00:00:00'); return dt.toLocaleDateString('es-ES',{day:'numeric',month:'short',year:'numeric'}); }
    function _fmtDateShort(d) { if (!d) return ''; const dt = new Date(d+'T00:00:00'); return dt.toLocaleDateString('es-ES',{weekday:'short',day:'numeric',month:'short'}); }

    // ══════════════════════════════════════════════
    //  WELCOME (no projects)
    // ══════════════════════════════════════════════
    function renderWelcome() {
        $main().innerHTML = `
            <div class="welcome-screen">
                <div class="welcome-logo">⬡</div>
                <h1 class="welcome-title">Hack<span class="accent">Planner</span></h1>
                <p class="welcome-desc">Sistema profesional de planificación y gestión multi-proyecto para ethical hacking. Controla tus activos, plazos y retests.</p>
                <button class="btn btn-primary btn-lg" id="btnNewProject">＋ Nuevo Proyecto</button>
            </div>`;
        $('btnNewProject').addEventListener('click', () => showProjectForm());
    }

    // ══════════════════════════════════════════════
    //  PROJECT FORM (create / edit)
    // ══════════════════════════════════════════════
    function showProjectForm(existing) {
        const p = existing || {};
        const today = new Date().toISOString().split('T')[0];
        // Compute existing endDate if editing
        const existingEndDate = p.endDate || (p.startDate && p.totalDays 
            ? _addDaysHelper(p.startDate, p.totalDays - 1)
            : '');
        openModal(existing ? 'Editar Proyecto' : 'Nuevo Proyecto', `
            <form id="projForm" autocomplete="off">
                <div class="form-group">
                    <label class="form-label">Nombre del Proyecto</label>
                    <input class="form-input" id="pName" placeholder="ej: Auditoria ACME" value="${p.name||''}" required>
                </div>
                <div class="form-group">
                    <label class="form-label">Administrador / Responsable</label>
                    <input class="form-input" id="pAdmin" placeholder="ej: Juan Perez" value="${p.administrator||''}" required>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label class="form-label">Fecha de Inicio</label>
                        <input class="form-input" type="date" id="pStart" value="${p.startDate||today}" required>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Fecha de Entrega</label>
                        <input class="form-input" type="date" id="pEnd" value="${existingEndDate}" required>
                        <span class="form-hint">Los dias disponibles se calculan automaticamente</span>
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label class="form-label">Horas / Dia</label>
                        <input class="form-input" type="number" id="pHours" min="1" max="24" step="0.5" placeholder="8" value="${p.hoursPerDay||''}" required>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Prioridad</label>
                        <select class="form-select" id="pPriority">
                            <option value="1" ${p.priority===1?'selected':''}>🔴 Alta</option>
                            <option value="2" ${(!p.priority||p.priority===2)?'selected':''}>🟡 Media</option>
                            <option value="3" ${p.priority===3?'selected':''}>🔵 Baja</option>
                        </select>
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label class="form-label">% Hacking</label>
                        <input class="form-input" type="number" id="pHack" min="0" max="100" value="${p.hackingPct||70}" required>
                    </div>
                    <div class="form-group">
                        <label class="form-label">% Documentacion</label>
                        <input class="form-input" type="number" id="pDoc" min="0" max="100" value="${p.docPct||30}" required>
                    </div>
                </div>
                <button type="submit" class="btn btn-primary btn-block btn-lg mt-md">${existing?'Actualizar':'Crear Proyecto'}</button>
            </form>`);

        $('projForm').addEventListener('submit', e => {
            e.preventDefault();
            const hack = parseInt($('pHack').value), doc = parseInt($('pDoc').value);
            if (hack + doc !== 100) { toast('Los porcentajes deben sumar 100%','error'); return; }

            const startDate = $('pStart').value;
            const endDate = $('pEnd').value;
            if (endDate <= startDate) { toast('La fecha de entrega debe ser posterior al inicio','error'); return; }

            // Compute totalDays from date range (exclusive of weekends)
            const totalDays = Planner.countBusinessDays(startDate, endDate);

            const proj = {
                id: p.id || _uid(),
                name: $('pName').value.trim(),
                administrator: $('pAdmin').value.trim(),
                startDate,
                endDate,
                totalDays,
                hoursPerDay: parseFloat($('pHours').value),
                hackingPct: hack, docPct: doc,
                priority: parseInt($('pPriority').value),
                status: p.status || 'active',
                createdAt: p.createdAt || new Date().toISOString(),
            };
            Storage.saveProject(proj);

            // Priority shifting
            if (!existing) {
                const all = Storage.loadProjects();
                const shifted = Planner.shiftLowerPriorityDates(all, proj);
                Storage.saveProjects(shifted);
            }

            // Generate plan if assets exist
            const assets = Storage.loadAssets(proj.id);
            if (assets.length) {
                const plan = Planner.generatePlan(proj, assets);
                if (plan) Storage.savePlan(proj.id, plan);
            }

            closeModal();
            toast(existing ? 'Proyecto actualizado' : 'Proyecto creado');
            App.navigate('projects');
        });
    }

    // ══════════════════════════════════════════════
    //  DASHBOARD — multi-project control panel
    // ══════════════════════════════════════════════
    function renderDashboard() {
        const projects = Storage.loadProjects();
        const allAssets = Storage.loadAllAssets();
        const gm = Planner.getGlobalMetrics(projects, allAssets);
        
        const active = projects.filter(p => {
            if (p.status === 'completed') return false;
            const pAssets = allAssets.filter(a => a.projectId === p.id);
            const m = Planner.getProjectMetrics(p, pAssets);
            return m.computedStatus !== 'completed';
        });

        $main().innerHTML = `
            <div class="view">
                <div class="view-header flex-between">
                    <div>
                        <h2 class="view-title"><span class="icon">⬡</span> Panel de Control</h2>
                        <p class="view-subtitle">Vista global de todos los proyectos</p>
                    </div>
                    <button class="btn btn-primary" onclick="UI.showProjectForm()">＋ Nuevo Proyecto</button>
                </div>

                <div class="stats-grid">
                    <div class="stat-card stat-cyan">
                        <span class="stat-label">Proyectos Activos</span>
                        <span class="stat-value">${gm.activeProjects}</span>
                        <span class="stat-detail">${gm.totalProjects} total</span>
                    </div>
                    <div class="stat-card stat-green" title="Total historico de la plataforma">
                        <span class="stat-label">Activos Completados</span>
                        <span class="stat-value">${gm.historicalCompletedAssets}</span>
                        <span class="stat-detail">de ${gm.historicalTotalAssets} historico</span>
                    </div>
                    <div class="stat-card stat-yellow">
                        <span class="stat-label">En Ejecucion</span>
                        <span class="stat-value">${gm.inProgressAssets}</span>
                        <span class="stat-detail">${gm.pendingAssets} pendientes</span>
                    </div>
                    <div class="stat-card ${gm.delayedProjects > 0 ? 'stat-red' : 'stat-green'}">
                        <span class="stat-label">Proyectos Atrasados</span>
                        <span class="stat-value">${gm.delayedProjects}</span>
                        <span class="stat-detail">${gm.delayedProjects === 0 ? 'Todo en orden' : 'Requieren atencion'}</span>
                    </div>
                </div>

                <!-- Global progress -->
                <div class="card mb-lg">
                    <div class="progress-label">
                        <span>Progreso Global</span>
                        <span class="progress-percentage">${gm.globalProgressPct}%</span>
                    </div>
                    <div class="progress-bar progress-bar-lg">
                        <div class="progress-fill" style="width:${gm.globalProgressPct}%"></div>
                    </div>
                </div>

                <!-- Active projects list -->
                <div class="section-header">
                    <h3 class="section-title">Proyectos en Ejecucion</h3>
                </div>
                ${active.length ? `<div class="project-grid">${active.map(p => _projectCard(p, allAssets)).join('')}</div>` : `
                    <div class="empty-state">
                        <div class="empty-state-icon">📂</div>
                        <p class="empty-state-title">Sin proyectos activos</p>
                        <p class="empty-state-text">Crea tu primer proyecto para comenzar.</p>
                    </div>`}
            </div>`;
    }

    function _projectCard(p, allAssets) {
        const pAssets = allAssets.filter(a => a.projectId === p.id);
        const m = Planner.getProjectMetrics(p, pAssets);
        const priorityClass = { 1:'priority-high', 2:'priority-medium', 3:'priority-low' }[p.priority] || 'priority-medium';
        const endDate = p.endDate || _addDaysHelper(p.startDate, p.totalDays - 1);
        return `
            <div class="project-card ${priorityClass}" onclick="App.navigate('project/${p.id}')">
                <div class="project-card-header">
                    <div>
                        <div class="project-card-name">${p.name}</div>
                        <div class="project-card-admin">👤 ${p.administrator}</div>
                    </div>
                    <span class="badge badge-priority-${_priorityLabel(p.priority).toLowerCase()}">${_priorityLabel(p.priority)}</span>
                </div>
                <div class="project-card-meta">
                    <span class="badge badge-${m.computedStatus}">${_statusLabel(m.computedStatus)}</span>
                    <span class="pace-indicator pace-${m.pace}" style="font-size:var(--text-xs);padding:2px 8px;">${m.pace === 'on-track' ? '✓' : m.pace === 'ahead' ? '⚡' : '⚠'} ${m.pace === 'on-track' ? 'En hora' : m.pace === 'ahead' ? 'Adelantado' : 'Atrasado'}</span>
                </div>
                <div style="font-size:var(--text-xs);color:var(--text-muted);font-family:var(--font-mono);margin-bottom:var(--space-sm);">
                    📅 Entrega: <span style="color:var(--neon-yellow);">${_fmtDate(endDate)}</span>
                </div>
                <div class="progress-bar" style="margin-bottom:var(--space-sm);">
                    <div class="progress-fill" style="width:${m.progressPct}%"></div>
                </div>
                <div class="project-card-stats">
                    <div class="project-card-stat"><span class="val text-cyan">${m.progressPct}%</span><span class="lbl">Progreso</span></div>
                    <div class="project-card-stat"><span class="val text-green">${m.completed}/${m.total}</span><span class="lbl">Activos</span></div>
                    <div class="project-card-stat"><span class="val ${m.remainingDays <= 3 && m.remainingDays > 0 ? 'text-red' : 'text-yellow'}">${m.remainingDays}</span><span class="lbl">Dias Rest.</span></div>
                    <div class="project-card-stat"><span class="val text-orange">${m.retest}</span><span class="lbl">Retest</span></div>
                </div>
            </div>`;
    }

    // ══════════════════════════════════════════════
    //  PROJECTS LIST
    // ══════════════════════════════════════════════
    function renderProjects() {
        const projects = Storage.loadProjects();
        const allAssets = Storage.loadAllAssets();

        $main().innerHTML = `
            <div class="view">
                <div class="view-header flex-between">
                    <div>
                        <h2 class="view-title"><span class="icon">📂</span> Proyectos</h2>
                        <p class="view-subtitle">${projects.length} proyectos registrados</p>
                    </div>
                    <button class="btn btn-primary" onclick="UI.showProjectForm()">＋ Nuevo Proyecto</button>
                </div>

                ${projects.length ? `
                    <div class="table-container">
                        <table class="data-table">
                            <thead><tr>
                                <th>Proyecto</th><th>Administrador</th><th>Prioridad</th><th>Progreso</th><th>Dias Rest.</th><th>Estado</th><th>Acciones</th>
                            </tr></thead>
                            <tbody>
                                ${projects.sort((a,b) => (a.priority||2)-(b.priority||2)).map(p => {
                                    const pAssets = allAssets.filter(a => a.projectId === p.id);
                                    const m = Planner.getProjectMetrics(p, pAssets);
                                    return `<tr style="cursor:pointer;" onclick="App.navigate('project/${p.id}')">
                                        <td><span class="text-mono" style="font-weight:600;">${p.name}</span></td>
                                        <td class="text-muted">👤 ${p.administrator}</td>
                                        <td><span class="badge badge-priority-${_priorityLabel(p.priority).toLowerCase()}">${_priorityLabel(p.priority)}</span></td>
                                        <td>
                                            <div style="display:flex;align-items:center;gap:8px;">
                                                <div class="progress-bar" style="width:80px;height:6px;"><div class="progress-fill" style="width:${m.progressPct}%"></div></div>
                                                <span class="text-mono text-green" style="font-size:var(--text-xs);">${m.progressPct}%</span>
                                            </div>
                                        </td>
                                        <td><span class="text-mono ${m.remainingDays <= 3 ? 'text-red' : 'text-yellow'}">${m.remainingDays}d</span></td>
                                        <td><span class="badge badge-${m.computedStatus}">${_statusLabel(m.computedStatus)}</span></td>
                                        <td>
                                            <div style="display:flex;gap:6px;" onclick="event.stopPropagation()">
                                                <button class="btn btn-sm btn-secondary" onclick="UI.showProjectForm(Storage.getProject('${p.id}'))" title="Editar">✎</button>
                                                <button class="btn btn-sm btn-orange" onclick="App.archiveProject('${p.id}')" title="Archivar">📦</button>
                                                <button class="btn btn-sm btn-danger-outline" onclick="App.removeProject('${p.id}')" title="Eliminar">✗</button>
                                            </div>
                                        </td>
                                    </tr>`;
                                }).join('')}
                            </tbody>
                        </table>
                    </div>` : `
                    <div class="empty-state">
                        <div class="empty-state-icon">📂</div>
                        <p class="empty-state-title">Sin proyectos</p>
                        <p class="empty-state-text">Crea un proyecto para comenzar a planificar.</p>
                    </div>`}
            </div>`;
    }

    // ══════════════════════════════════════════════
    //  PROJECT DETAIL — assets + management
    // ══════════════════════════════════════════════
    function renderProjectDetail(projectId) {
        const p = Storage.getProject(projectId);
        if (!p) { App.navigate('projects'); return; }
        const assets = Storage.loadAssets(projectId);
        const plan = Storage.loadPlan(projectId);
        const m = Planner.getProjectMetrics(p, assets);

        const endDate = Planner._addDays ? Planner._addDays(p.startDate, p.totalDays - 1) : '';

        $main().innerHTML = `
            <div class="view">
                <div class="view-header">
                    <div class="flex-between">
                        <div>
                            <h2 class="view-title"><span class="icon">📋</span> ${p.name}</h2>
                            <p class="view-subtitle">👤 ${p.administrator} &nbsp;·&nbsp; ${_fmtDate(p.startDate)} → <span style="color:var(--neon-yellow);font-weight:600;">${_fmtDate(p.endDate || _addDaysHelper(p.startDate, p.totalDays - 1))}</span> &nbsp;·&nbsp; ${p.totalDays} dias &nbsp;·&nbsp; Prioridad: ${_priorityLabel(p.priority)}</p>
                        </div>
                        <div style="display:flex;gap:var(--space-sm);">
                            ${(m.completed === m.total && m.total > 0 && p.phase !== 'retest') ? `<button class="btn btn-orange" onclick="App.startRetestPhase('${p.id}')">★ Iniciar Retest</button>` : ''}
                            <button class="btn btn-secondary" onclick="UI.showProjectForm(Storage.getProject('${p.id}'))">⚙ Editar</button>
                            ${p.phase !== 'retest' ? `<button class="btn btn-cyan" onclick="App.regeneratePlan('${p.id}')">⟳ Replanificar</button>` : ''}
                            <button class="btn btn-secondary" onclick="App.navigate('projects')">← Volver</button>
                        </div>
                    </div>
                </div>

                <!-- Project stats -->
                <div class="stats-grid">
                    <div class="stat-card stat-green">
                        <span class="stat-label">Progreso</span>
                        <span class="stat-value">${m.progressPct}%</span>
                        <span class="stat-detail">${m.completed} de ${m.total} completados</span>
                    </div>
                    <div class="stat-card stat-cyan">
                        <span class="stat-label">En Ejecucion</span>
                        <span class="stat-value">${m.inProgress}</span>
                        <span class="stat-detail">${m.pending} pendientes</span>
                    </div>
                    <div class="stat-card ${m.remainingDays <= 3 && m.remainingDays > 0 ? 'stat-red' : 'stat-yellow'}">
                        <span class="stat-label">Dias Restantes</span>
                        <span class="stat-value">${m.remainingDays}</span>
                        <span class="stat-detail">Dia ${m.currentDay} de ${p.totalDays}</span>
                    </div>
                    <div class="stat-card stat-orange">
                        <span class="stat-label">Retest</span>
                        <span class="stat-value">${m.retest}</span>
                        <span class="stat-detail">${m.retestCompleted} completados</span>
                    </div>
                </div>

                <!-- Progress bar -->
                <div class="card mb-lg">
                    <div class="progress-label">
                        <span>Progreso del Proyecto</span>
                        <span class="progress-percentage">${m.progressPct}%</span>
                    </div>
                    <div class="progress-bar progress-bar-lg">
                        <div class="progress-fill" style="width:${m.progressPct}%"></div>
                    </div>
                    <div class="flex-between mt-sm">
                        <span class="pace-indicator pace-${m.pace}">${m.pace === 'on-track' ? '✓ En hora' : m.pace === 'ahead' ? '⚡ Adelantado' : '⚠ Atrasado'}</span>
                        <span class="text-muted text-mono" style="font-size:var(--text-xs)">Esperado: ${m.expectedPct}% | Real: ${m.progressPct}%</span>
                    </div>
                </div>

                <!-- Assets section -->
                <div class="section-header">
                    <h3 class="section-title">Activos (${assets.length})</h3>
                    <div style="display:flex;gap:var(--space-sm);align-items:center;">
                        <div class="view-toggles">
                            <button class="view-toggle-btn ${currentViewMode==='list'?'active':''}" onclick="UI.setViewMode('list');App.navigate('project/${p.id}')">Lista</button>
                            <button class="view-toggle-btn ${currentViewMode==='grid'?'active':''}" onclick="UI.setViewMode('grid');App.navigate('project/${p.id}')">Grid</button>
                            <button class="view-toggle-btn ${currentViewMode==='kanban'?'active':''}" onclick="UI.setViewMode('kanban');App.navigate('project/${p.id}')">Kanban</button>
                        </div>
                        <button class="btn btn-primary btn-sm" onclick="UI.showAssetForm('${p.id}')">＋ Activo</button>
                    </div>
                </div>

                <div id="assetsContainer">
                    ${assets.length ? _renderAssetsView(assets, p.id) : `
                        <div class="empty-state">
                            <div class="empty-state-icon">📦</div>
                            <p class="empty-state-title">Sin activos</p>
                            <p class="empty-state-text">Agrega los activos que necesitas auditar.</p>
                        </div>`}
                </div>
            </div>`;
    }

    function _renderAssetsView(assets, projectId) {
        if (currentViewMode === 'kanban') return _renderKanban(assets, projectId);
        if (currentViewMode === 'list') return _renderAssetTable(assets, projectId);
        return _renderAssetGrid(assets, projectId);
    }

    function _renderAssetTable(assets, projectId) {
        return `<div class="table-container"><table class="data-table">
            <thead><tr><th>Activo</th><th>Dias Est.</th><th>Estado</th><th>Retest</th><th>Acciones</th></tr></thead>
            <tbody>${assets.map(a => `
                <tr>
                    <td><span class="text-mono" style="font-weight:600;">${a.name}</span>${a.notes ? `<br><span class="text-muted" style="font-size:10px;">${a.notes}</span>` : ''}</td>
                    <td class="text-mono">${a.daysEstimated || 3}d</td>
                    <td><span class="badge badge-${a.status}">${_statusLabel(a.status)}</span></td>
                    <td>
                        ${a.retestStatus ? `<span class="badge badge-${a.retestStatus === 'completed' ? 'completed' : 'retest'}" style="margin-bottom:4px;">${_statusLabel(a.retestStatus === 'completed' ? 'completed' : 'retest')}</span>` : '<span class="text-muted">—</span>'}
                        ${a.retestDate ? `<div style="font-size:10px;color:var(--text-muted);">Ent: ${_fmtDateShort(a.retestDate)}</div>` : ''}
                    </td>
                    <td><div style="display:flex;gap:4px;">
                        <button class="btn btn-sm btn-secondary" onclick="App.cycleAssetStatus('${a.id}')" title="Cambiar estado">${a.status==='pending'?'▶':a.status==='in-progress'?'✓':'↩'}</button>
                        <button class="btn btn-sm btn-orange" onclick="App.toggleRetest('${a.id}')" title="Retest">🔄</button>
                        <button class="btn btn-sm btn-secondary" onclick="UI.showAssetForm('${projectId}',Storage.loadAllAssets().find(x=>x.id==='${a.id}'))" title="Editar">✎</button>
                        <button class="btn btn-sm btn-danger-outline" onclick="App.deleteAsset('${a.id}')" title="Eliminar">✗</button>
                    </div></td>
                </tr>`).join('')}
            </tbody></table></div>`;
    }

    function _renderAssetGrid(assets, projectId) {
        return `<div class="project-grid">${assets.map(a => `
            <div class="card" style="padding:var(--space-md);">
                <div class="flex-between mb-md">
                    <span class="text-mono" style="font-weight:600;font-size:var(--text-base);">${a.name}</span>
                    <span class="badge badge-${a.status}">${_statusLabel(a.status)}</span>
                </div>
                ${a.notes ? `<p class="text-muted" style="font-size:var(--text-xs);margin-bottom:var(--space-sm);">${a.notes}</p>` : ''}
                <div class="flex-between" style="font-size:var(--text-xs);color:var(--text-muted);margin-bottom:var(--space-sm);">
                    <span class="text-mono">${a.daysEstimated||3} dias est.</span>
                    <div style="text-align:right;">
                        ${a.retestStatus ? `<span class="badge badge-${a.retestStatus==='completed'?'completed':'retest'}" style="font-size:10px;">Retest: ${_statusLabel(a.retestStatus)}</span>` : ''}
                        ${a.retestDate ? `<div style="font-size:10px;margin-top:2px;">Ent: ${_fmtDateShort(a.retestDate)}</div>` : ''}
                    </div>
                </div>
                <div style="display:flex;gap:4px;margin-top:var(--space-sm);">
                    <button class="btn btn-sm btn-secondary" onclick="App.cycleAssetStatus('${a.id}')">${a.status==='pending'?'▶ Iniciar':a.status==='in-progress'?'✓ Completar':'↩ Reabrir'}</button>
                    <button class="btn btn-sm btn-orange" onclick="App.toggleRetest('${a.id}')" title="Retest">🔄</button>
                    <button class="btn btn-sm btn-secondary" onclick="UI.showAssetForm('${projectId}',Storage.loadAllAssets().find(x=>x.id==='${a.id}'))">✎</button>
                    <button class="btn btn-sm btn-danger-outline" onclick="App.deleteAsset('${a.id}')">✗</button>
                </div>
            </div>`).join('')}</div>`;
    }

    function _renderKanban(assets, projectId) {
        const cols = [
            { key:'pending', label:'Pendientes', color:'var(--status-pending)' },
            { key:'in-progress', label:'En Curso', color:'var(--status-in-progress)' },
            { key:'retest', label:'Retest', color:'var(--status-retest)' },
            { key:'completed', label:'Completados', color:'var(--status-completed)' },
        ];
        return `<div class="kanban-board">${cols.map(col => {
            const items = assets.filter(a => {
                if (col.key === 'retest') return a.retestStatus === 'pending' || a.retestStatus === 'in-progress';
                return a.status === col.key && (!a.retestStatus || a.retestStatus === 'completed' || col.key !== 'completed');
            });
            return `<div class="kanban-column">
                <div class="kanban-column-title" style="border-bottom-color:${col.color};color:${col.color};">${col.label} <span class="count">${items.length}</span></div>
                ${items.map(a => `
                    <div class="kanban-item" onclick="App.cycleAssetStatus('${a.id}')">
                        <div class="kanban-item-name">${a.name}</div>
                        <div class="kanban-item-meta">
                            <span>${a.daysEstimated||3}d</span>
                            ${a.retestStatus ? `<span class="text-orange">Retest</span>` : ''}
                        </div>
                    </div>`).join('')}
                ${items.length === 0 ? '<p style="text-align:center;color:var(--text-muted);font-size:var(--text-xs);padding:var(--space-md);">Vacio</p>' : ''}
            </div>`;
        }).join('')}</div>`;
    }

    // ── Asset form ──
    function showAssetForm(projectId, existing) {
        const a = existing || {};
        openModal(existing ? 'Editar Activo' : 'Nuevo Activo', `
            <form id="assetForm" autocomplete="off">
                <div class="form-group">
                    <label class="form-label">Nombre del Activo</label>
                    <input class="form-input" id="aName" placeholder="ej: Server-01, WebApp-X" value="${a.name||''}" required>
                </div>
                <div class="form-group">
                    <label class="form-label">Dias Estimados</label>
                    <input class="form-input" type="number" id="aDays" min="1" max="60" value="${a.daysEstimated||3}" required>
                    <span class="form-hint">Por defecto 3 dias por activo</span>
                </div>
                <div class="form-group">
                    <label class="form-label">Notas (opcional)</label>
                    <input class="form-input" id="aNotes" placeholder="IP, plataforma, observaciones..." value="${a.notes||''}">
                </div>
                <div class="form-group border-top pt-md" style="margin-top:var(--space-md); border-top: 1px solid var(--border-subtle); padding-top:var(--space-md);">
                    <label class="form-label text-orange">Fecha de Entrega Retest (Opcional)</label>
                    <input class="form-input" type="date" id="aRetestDate" value="${a.retestDate||''}">
                    <span class="form-hint">Específica cuándo se debe entregar el retest para este activo</span>
                </div>
                <button type="submit" class="btn btn-primary btn-block btn-lg mt-md">${existing?'Actualizar':'Agregar Activo'}</button>
            </form>`);

        $('assetForm').addEventListener('submit', e => {
            e.preventDefault();
            const asset = {
                id: a.id || _uid(),
                projectId: projectId,
                name: $('aName').value.trim(),
                daysEstimated: parseInt($('aDays').value),
                notes: $('aNotes').value.trim(),
                retestDate: $('aRetestDate').value,
                status: a.status || 'pending',
                retestStatus: a.retestStatus || null,
                createdAt: a.createdAt || new Date().toISOString(),
            };
            Storage.saveAsset(asset);

            // Regenerate plan
            const proj = Storage.getProject(projectId);
            if (proj) {
                const allAssets = Storage.loadAssets(projectId);
                const plan = Planner.generatePlan(proj, allAssets);
                if (plan) Storage.savePlan(projectId, plan);
            }

            closeModal();
            toast(existing ? 'Activo actualizado' : 'Activo agregado');
            App.navigate('project/' + projectId);
        });
    }

    // ══════════════════════════════════════════════
    //  PLAN VIEW (select project)
    // ══════════════════════════════════════════════
    function renderPlan() {
        const projects = Storage.loadProjects().filter(p => p.status !== 'completed');
        const activeId = Storage.getActiveProject();

        if (projects.length === 0) {
            $main().innerHTML = `<div class="view"><div class="view-header"><h2 class="view-title"><span class="icon">📅</span> Plan Diario</h2></div>
                <div class="empty-state"><div class="empty-state-icon">📅</div><p class="empty-state-title">Sin proyectos activos</p></div></div>`;
            return;
        }

        const selectedId = activeId && projects.find(p => p.id === activeId) ? activeId : projects[0].id;
        const p = Storage.getProject(selectedId);
        const assets = Storage.loadAssets(selectedId);
        const plan = Storage.loadPlan(selectedId);
        const metrics = Planner.getProjectMetrics(p, assets);

        $main().innerHTML = `
            <div class="view">
                <div class="view-header flex-between">
                    <div>
                        <h2 class="view-title"><span class="icon">📅</span> Plan Diario</h2>
                        <p class="view-subtitle">Selecciona un proyecto para ver su plan</p>
                    </div>
                    <div style="display:flex;gap:var(--space-sm);align-items:center;">
                        <select class="form-select" style="width:auto;min-width:200px;" id="planProjectSelect">
                            ${projects.map(pr => `<option value="${pr.id}" ${pr.id===selectedId?'selected':''}>${pr.name}</option>`).join('')}
                        </select>
                        <button class="btn btn-cyan" onclick="App.regeneratePlan('${selectedId}')">⟳ Replanificar</button>
                    </div>
                </div>

                ${plan && plan.days && plan.days.length ? plan.days.map(day => {
                    const isToday = day.dayNumber === metrics.currentDay;
                    const isPast = day.dayNumber < metrics.currentDay;
                    return `
                    <div class="day-card ${isToday?'is-today':''} ${isPast?'is-past':''}">
                        <div class="day-card-header">
                            <span class="day-number">${isToday?'▸ ':''}Dia ${day.dayNumber}</span>
                            <span class="day-date">${_fmtDateShort(day.date)}</span>
                        </div>
                        <div class="day-time-split">
                            ${day.hackingHours > 0 ? `<div class="time-block time-block-hacking"><span class="time-value">${day.hackingHours}h</span>Hacking</div>` : ''}
                            ${day.docHours > 0 ? `<div class="time-block time-block-doc"><span class="time-value">${day.docHours}h</span>Documentacion</div>` : ''}
                        </div>
                        <div class="day-assets-list">
                            ${day.assets.map(a => {
                                const cur = assets.find(x => x.id === a.assetId) || a;
                                return `<div class="day-asset-item">
                                    <div class="day-asset-info">
                                        <span class="day-asset-name">${cur.name || a.assetName}</span>
                                    </div>
                                    <div style="display:flex;align-items:center;gap:6px;">
                                        <span class="badge badge-${cur.status||'pending'}">${_statusLabel(cur.status||'pending')}</span>
                                        ${cur.retestStatus ? `<span class="badge badge-retest">Retest</span>` : ''}
                                    </div>
                                </div>`;
                            }).join('')}
                        </div>
                    </div>`;
                }).join('') : `<div class="empty-state"><div class="empty-state-icon">📅</div><p class="empty-state-title">Sin plan generado</p><p class="empty-state-text">Agrega activos al proyecto para generar el plan.</p></div>`}
            </div>`;

        $('planProjectSelect').addEventListener('change', e => {
            Storage.setActiveProject(e.target.value);
            App.navigate('plan');
        });
    }

    // ══════════════════════════════════════════════
    //  PROGRESS VIEW
    // ══════════════════════════════════════════════
    function renderProgress() {
        const projects = Storage.loadProjects();
        const allAssets = Storage.loadAllAssets();

        $main().innerHTML = `
            <div class="view">
                <div class="view-header">
                    <h2 class="view-title"><span class="icon">📊</span> Progreso</h2>
                    <p class="view-subtitle">Resumen de avance por proyecto</p>
                </div>

                ${projects.length ? projects.map(p => {
                    const pAssets = allAssets.filter(a => a.projectId === p.id);
                    const m = Planner.getProjectMetrics(p, pAssets);
                    return `
                    <div class="card mb-lg" style="cursor:pointer;" onclick="App.navigate('project/${p.id}')">
                        <div class="flex-between mb-md">
                            <div>
                                <span class="text-mono" style="font-size:var(--text-lg);font-weight:700;">${p.name}</span>
                                <span class="text-muted" style="font-size:var(--text-xs);margin-left:var(--space-sm);">👤 ${p.administrator}</span>
                            </div>
                            <div style="display:flex;gap:var(--space-sm);">
                                <span class="badge badge-${m.computedStatus}">${_statusLabel(m.computedStatus)}</span>
                                <span class="pace-indicator pace-${m.pace}" style="font-size:var(--text-xs);padding:2px 8px;">${m.pace==='on-track'?'✓ En hora':m.pace==='ahead'?'⚡ Adelantado':'⚠ Atrasado'}</span>
                            </div>
                        </div>
                        <div class="progress-label">
                            <span class="text-muted" style="font-size:var(--text-xs);">Dia ${m.currentDay} de ${p.totalDays} · ${m.remainingDays} dias restantes</span>
                            <span class="progress-percentage">${m.progressPct}%</span>
                        </div>
                        <div class="progress-bar"><div class="progress-fill" style="width:${m.progressPct}%"></div></div>
                        <div style="display:flex;gap:var(--space-lg);margin-top:var(--space-md);font-size:var(--text-xs);font-family:var(--font-mono);">
                            <span class="text-green">✓ ${m.completed} completados</span>
                            <span class="text-cyan">▶ ${m.inProgress} en curso</span>
                            <span class="text-muted">◻ ${m.pending} pendientes</span>
                            <span class="text-orange">🔄 ${m.retest} retest</span>
                        </div>
                    </div>`;
                }).join('') : `<div class="empty-state"><div class="empty-state-icon">📊</div><p class="empty-state-title">Sin proyectos</p></div>`}
            </div>`;
    }

    // ══════════════════════════════════════════════
    //  GLOBAL CALENDAR VIEW
    // ══════════════════════════════════════════════
    function renderCalendar() {
        const projects = Storage.loadProjects().filter(p => p.status !== 'completed');
        const allAssets = Storage.loadAllAssets();
        const calendarDays = Planner.generateGlobalCalendar(projects, allAssets);

        let html = `
            <div class="view">
                <div class="view-header flex-between mb-lg">
                    <div>
                        <h2 class="view-title"><span class="icon">📅</span> Calendario Global</h2>
                        <p class="view-subtitle">Distribucion automatica de tiempo basada en prioridad (L-V 8am-12pm, 1pm-6pm)</p>
                    </div>
                </div>
        `;

        if (calendarDays && calendarDays.length > 0) {
            html += `<div class="timeline" style="margin-top:var(--space-xl);">`;
            
            calendarDays.forEach((day) => {
                const dateStr = day.date.toLocaleDateString('es-ES', { weekday:'long', day:'numeric', month:'long' });
                const blocksHtml = day.blocks.map(b => {
                    const priorityClass = { 1:'high', 2:'medium', 3:'low' }[b.priority] || 'medium';
                    return `
                        <div class="time-block" style="border-left: 3px solid var(--priority-${priorityClass}); margin-bottom: 8px; text-align: left; background: var(--bg-card); display: flex; justify-content: space-between; align-items: center; cursor: pointer;" onclick="App.navigate('project/${b.projectId}')">
                            <span class="text-mono" style="font-weight: 600; font-size: var(--text-sm);">${b.projectName}</span>
                            <div style="display:flex; gap: 8px; align-items:center;">
                                <span class="badge badge-priority-${priorityClass}">${_priorityLabel(b.priority)}</span>
                                <span class="badge badge-${b.type === 'Hacking' ? 'priority-high' : 'priority-low'}">${b.type}</span>
                                <span class="text-mono text-cyan" style="font-weight:700;">${b.hours}h</span>
                            </div>
                        </div>
                    `;
                }).join('');

                html += `
                    <div class="timeline-item">
                        <div class="card" style="padding:var(--space-lg);">
                            <div style="font-size:var(--text-lg);font-weight:700;margin-bottom:var(--space-md);color:var(--neon-green);text-transform:capitalize;">
                                ${dateStr}
                            </div>
                            <div style="display:flex; flex-direction:column;">
                                ${blocksHtml}
                            </div>
                        </div>
                    </div>
                `;
            });

            html += `</div>`;
        } else {
            html += `
                <div class="empty-state">
                    <div class="empty-state-icon">📅</div>
                    <p class="empty-state-title">Calendario libre</p>
                    <p class="empty-state-text">No hay tareas pendientes en los proyectos activos para planificar.</p>
                </div>
            `;
        }

        html += `</div>`;
        $main().innerHTML = html;
    }

    // ══════════════════════════════════════════════
    //  REGISTRY
    // ══════════════════════════════════════════════
    function renderRegistry() {
        const registry = Storage.loadRegistry();

        $main().innerHTML = `
            <div class="view">
                <div class="view-header">
                    <h2 class="view-title"><span class="icon">📜</span> Registro de Proyectos</h2>
                    <p class="view-subtitle">${registry.length} proyectos archivados</p>
                </div>

                ${registry.length ? `<div class="timeline">${registry.reverse().map(r => `
                    <div class="timeline-item archived">
                        <div class="card">
                            <div class="flex-between mb-md">
                                <span class="text-mono" style="font-size:var(--text-lg);font-weight:700;">${r.name}</span>
                                <div style="display:flex;gap:var(--space-sm);align-items:center;">
                                    <span class="text-muted text-mono" style="font-size:var(--text-xs);">${_fmtDate(r.archivedAt ? r.archivedAt.split('T')[0] : '')}</span>
                                    <button class="btn btn-sm btn-danger-outline" onclick="App.removeRegistryEntry('${r.archivedAt}')" title="Eliminar del registro">✗</button>
                                </div>
                            </div>
                            <p class="text-muted" style="font-size:var(--text-xs);margin-bottom:var(--space-sm);">👤 ${r.administrator} · Prioridad: ${_priorityLabel(r.priority)}</p>
                            <div style="display:flex;gap:var(--space-lg);font-size:var(--text-xs);font-family:var(--font-mono);">
                                <span>📦 ${r.summary.totalAssets} activos</span>
                                <span class="text-green">✓ ${r.summary.completedAssets} completados</span>
                                <span class="text-orange">🔄 ${r.summary.retestedAssets} retests</span>
                            </div>
                            <div class="mt-sm" style="font-size:var(--text-xs);color:var(--text-muted);">
                                Duracion: ${r.totalDays} dias · ${r.hoursPerDay}h/dia · ${_fmtDate(r.startDate)} → ${_fmtDate(_addDaysHelper(r.startDate, r.totalDays - 1))}
                            </div>
                        </div>
                    </div>`).join('')}</div>` : `
                    <div class="empty-state">
                        <div class="empty-state-icon">📜</div>
                        <p class="empty-state-title">Sin proyectos archivados</p>
                        <p class="empty-state-text">Los proyectos completados aparecen aqui como registro historico.</p>
                    </div>`}
            </div>`;
    }

    // ── View mode toggle ──
    function setViewMode(mode) { currentViewMode = mode; }

    // ── Date helper ──
    function _addDaysHelper(dateStr, addDays) {
        let d = new Date(dateStr + 'T00:00:00');
        let added = 0;
        while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
        while (added < addDays) {
            d.setDate(d.getDate() + 1);
            if (d.getDay() !== 0 && d.getDay() !== 6) added++;
        }
        return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    }

    // ══════════════════════════════════════════════
    //  ADMINISTRATION — Project management tracking
    // ══════════════════════════════════════════════
    let adminFilter = 'all'; // all | pendiente | en-progreso | entregado

    function _adminStatusLabel(s) {
        return { 'pendiente':'Pendiente','en-progreso':'En Progreso','entregado':'Entregado' }[s] || s;
    }
    function _adminStatusBadge(s) {
        const map = { 'pendiente':'pending','en-progreso':'in-progress','entregado':'completed' };
        return map[s] || 'pending';
    }

    function renderAdmin() {
        const projects = Storage.loadAdminProjects();
        
        // Calculate stats
        const total = projects.length;
        const vpnCount = projects.filter(p => p.vpn).length;
        const noVpnCount = total - vpnCount;
        const pendingCount = projects.filter(p => p.status === 'pendiente').length;
        const inProgressCount = projects.filter(p => p.status === 'en-progreso').length;
        const deliveredCount = projects.filter(p => p.status === 'entregado').length;
        const totalAssets = projects.reduce((sum, p) => sum + (p.assetCount || 0), 0);

        // filter
        const filtered = adminFilter === 'all' 
            ? projects 
            : projects.filter(p => p.status === adminFilter);

        // sort by delivery date ASC (soonest first), null dates at end
        filtered.sort((a, b) => {
            if (!a.deliveryDate && !b.deliveryDate) return 0;
            if (!a.deliveryDate) return 1;
            if (!b.deliveryDate) return -1;
            return a.deliveryDate.localeCompare(b.deliveryDate);
        });

        // Check overdue
        const today = new Date().toISOString().split('T')[0];

        $main().innerHTML = `
            <div class="view">
                <div class="view-header flex-between">
                    <div>
                        <h2 class="view-title"><span class="icon">🛡</span> Administración</h2>
                        <p class="view-subtitle">Gestión y seguimiento de proyectos administrados</p>
                    </div>
                    <button class="btn btn-primary" onclick="UI.showAdminProjectForm()">＋ Nuevo Proyecto</button>
                </div>

                <!-- Admin Stats -->
                <div class="stats-grid">
                    <div class="stat-card stat-cyan">
                        <span class="stat-label">Total Proyectos</span>
                        <span class="stat-value">${total}</span>
                        <span class="stat-detail">${totalAssets} activos totales</span>
                    </div>
                    <div class="stat-card stat-yellow">
                        <span class="stat-label">Pendientes</span>
                        <span class="stat-value">${pendingCount}</span>
                        <span class="stat-detail">${inProgressCount} en progreso</span>
                    </div>
                    <div class="stat-card stat-green">
                        <span class="stat-label">Entregados</span>
                        <span class="stat-value">${deliveredCount}</span>
                        <span class="stat-detail">${total > 0 ? Math.round((deliveredCount / total) * 100) : 0}% completados</span>
                    </div>
                    <div class="stat-card stat-orange">
                        <span class="stat-label">VPN</span>
                        <span class="stat-value">${vpnCount}</span>
                        <span class="stat-detail">${noVpnCount} sin VPN</span>
                    </div>
                </div>

                <!-- VPN / No-VPN breakdown bar -->
                ${total > 0 ? `
                <div class="card mb-lg">
                    <div class="progress-label">
                        <span>Proyectos Entregados</span>
                        <span class="progress-percentage">${Math.round((deliveredCount / total) * 100)}%</span>
                    </div>
                    <div class="progress-bar progress-bar-lg">
                        <div class="progress-fill" style="width:${Math.round((deliveredCount / total) * 100)}%"></div>
                    </div>
                    <div class="flex-between mt-sm" style="font-size:var(--text-xs);font-family:var(--font-mono);">
                        <span class="text-cyan">🔒 ${vpnCount} con VPN</span>
                        <span class="text-muted">🌐 ${noVpnCount} sin VPN</span>
                    </div>
                </div>` : ''}

                <!-- Filter + Table -->
                <div class="section-header">
                    <h3 class="section-title">Proyectos Administrados (${filtered.length})</h3>
                    <div style="display:flex;gap:var(--space-sm);align-items:center;">
                        <select class="form-select" style="width:auto;min-width:160px;" id="adminFilterSelect">
                            <option value="all" ${adminFilter==='all'?'selected':''}>Todos</option>
                            <option value="pendiente" ${adminFilter==='pendiente'?'selected':''}>Pendientes</option>
                            <option value="en-progreso" ${adminFilter==='en-progreso'?'selected':''}>En Progreso</option>
                            <option value="entregado" ${adminFilter==='entregado'?'selected':''}>Entregados</option>
                        </select>
                    </div>
                </div>

                ${filtered.length ? `
                    <div class="table-container">
                        <table class="data-table" id="adminTable">
                            <thead><tr>
                                <th>Proyecto</th><th>PM</th><th>Tipo</th><th>Prueba</th><th>Asignado a</th><th>Fecha Llegada</th><th>Fecha Entrega</th><th>Activos</th><th>VPN</th><th>Estado</th><th>Acciones</th>
                            </tr></thead>
                            <tbody>
                                ${filtered.map(p => {
                                    const isOverdue = p.deliveryDate && p.deliveryDate < today && p.status !== 'entregado';
                                    const daysLeft = p.deliveryDate ? _daysUntil(p.deliveryDate) : null;
                                    return `<tr class="${isOverdue ? 'admin-overdue' : ''}">
                                        <td>
                                            <span class="text-mono" style="font-weight:600;">${p.projectName}</span>
                                            ${p.notes ? `<br><span class="text-muted" style="font-size:10px;">${p.notes}</span>` : ''}
                                        </td>
                                        <td><span class="text-mono text-muted" style="font-weight:600;">👤 ${p.pm || '—'}</span></td>
                                        <td><span class="badge" style="background:var(--bg-tertiary);color:var(--text-primary);border:1px solid var(--border-default);">${p.projectType || '—'}</span></td>
                                        <td><span class="badge" style="background:rgba(0,212,255,0.1);color:var(--neon-cyan);border:1px solid rgba(0,212,255,0.2);">${p.testType || '—'}</span></td>
                                        <td><span class="text-mono" style="color:var(--neon-cyan);">👤 ${p.assignee}</span></td>
                                        <td class="text-mono" style="font-size:var(--text-xs);">${_fmtDate(p.arrivalDate)}</td>
                                        <td>
                                            <span class="text-mono ${isOverdue ? 'text-red' : ''}" style="font-size:var(--text-xs);font-weight:600;">${_fmtDate(p.deliveryDate)}</span>
                                            ${daysLeft !== null && p.status !== 'entregado' ? `<br><span style="font-size:10px;font-family:var(--font-mono);color:${daysLeft < 0 ? 'var(--neon-red)' : daysLeft <= 3 ? 'var(--neon-yellow)' : 'var(--text-muted)'};">${daysLeft < 0 ? `⚠ ${Math.abs(daysLeft)}d atrasado` : daysLeft === 0 ? '⚡ Hoy' : `${daysLeft}d restantes`}</span>` : ''}
                                        </td>
                                        <td><span class="text-mono text-cyan" style="font-weight:700;font-size:var(--text-lg);">${p.assetCount || 0}</span></td>
                                        <td>${p.vpn 
                                            ? '<span class="badge" style="background:rgba(255,138,0,0.15);color:var(--neon-orange);border:1px solid rgba(255,138,0,0.3);">🔒 VPN</span>' 
                                            : '<span class="badge" style="background:rgba(90,90,114,0.15);color:var(--text-muted);border:1px solid rgba(90,90,114,0.3);">🌐 No</span>'}</td>
                                        <td><span class="badge badge-${_adminStatusBadge(p.status)}" style="cursor:pointer;" onclick="event.stopPropagation();App.cycleAdminStatus('${p.id}')" title="Clic para cambiar estado">${_adminStatusLabel(p.status)}</span></td>
                                        <td>
                                            <div style="display:flex;gap:4px;">
                                                <button class="btn btn-sm btn-secondary" onclick="UI.showAdminProjectForm(Storage.getAdminProject('${p.id}'))" title="Editar">✎</button>
                                                <button class="btn btn-sm btn-danger-outline" onclick="App.deleteAdminProject('${p.id}')" title="Eliminar">✗</button>
                                            </div>
                                        </td>
                                    </tr>`;
                                }).join('')}
                            </tbody>
                        </table>
                    </div>
                ` : `
                    <div class="empty-state">
                        <div class="empty-state-icon">🛡</div>
                        <p class="empty-state-title">Sin proyectos administrativos</p>
                        <p class="empty-state-text">Agrega los proyectos que administras para llevar control de asignaciones, fechas y entregas.</p>
                    </div>
                `}
            </div>`;

        // Filter listener
        const filterEl = $('adminFilterSelect');
        if (filterEl) {
            filterEl.addEventListener('change', e => {
                adminFilter = e.target.value;
                renderAdmin();
            });
        }
    }

    function _daysUntil(dateStr) {
        const target = new Date(dateStr + 'T00:00:00');
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const diff = target - today;
        return Math.ceil(diff / (1000 * 60 * 60 * 24));
    }

    function showAdminProjectForm(existing) {
        const p = existing || {};
        const today = new Date().toISOString().split('T')[0];

        openModal(existing ? 'Editar Proyecto Administrativo' : 'Nuevo Proyecto Administrativo', `
            <form id="adminProjForm" autocomplete="off">
                <div class="form-group">
                    <label class="form-label">Nombre del Proyecto</label>
                    <input class="form-input" id="apName" placeholder="ej: Pentest Empresa XYZ" value="${p.projectName||''}" required>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label class="form-label">Project Manager (PM)</label>
                        <input class="form-input" id="apPm" placeholder="ej: Maria Fernandez" value="${p.pm||''}" required>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Asignado a</label>
                        <input class="form-input" id="apAssignee" placeholder="ej: Carlos López" value="${p.assignee||''}" required>
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label class="form-label">Tipo de Proyecto</label>
                        <select class="form-select" id="apType">
                            <option value="Ethical Hacking" ${(!p.projectType||p.projectType==='Ethical Hacking')?'selected':''}>Ethical Hacking</option>
                            <option value="Análisis Vulns." ${p.projectType==='Análisis Vulns.'?'selected':''}>Análisis Vulns.</option>
                            <option value="Retest" ${p.projectType==='Retest'?'selected':''}>Retest</option>
                            <option value="Ingeniería Social" ${p.projectType==='Ingeniería Social'?'selected':''}>Ingeniería Social</option>
                            <option value="Consultoría" ${p.projectType==='Consultoría'?'selected':''}>Consultoría</option>
                            <option value="Otro" ${p.projectType==='Otro'?'selected':''}>Otro</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Tipo de Prueba</label>
                        <select class="form-select" id="apTestType">
                            <option value="Web" ${(!p.testType||p.testType==='Web')?'selected':''}>Web</option>
                            <option value="Móvil" ${p.testType==='Móvil'?'selected':''}>Móvil</option>
                            <option value="Infraestructura" ${p.testType==='Infraestructura'?'selected':''}>Infraestructura</option>
                            <option value="Wi-Fi" ${p.testType==='Wi-Fi'?'selected':''}>Wi-Fi</option>
                            <option value="Nube" ${p.testType==='Nube'?'selected':''}>Nube</option>
                            <option value="API" ${p.testType==='API'?'selected':''}>API</option>
                            <option value="Mixto" ${p.testType==='Mixto'?'selected':''}>Mixto</option>
                            <option value="N/A" ${p.testType==='N/A'?'selected':''}>N/A</option>
                        </select>
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label class="form-label">Fecha de Llegada</label>
                        <input class="form-input" type="date" id="apArrival" value="${p.arrivalDate||today}" required>
                        <span class="form-hint">Cuándo se recibió el proyecto</span>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Fecha de Entrega</label>
                        <input class="form-input" type="date" id="apDelivery" value="${p.deliveryDate||''}" required>
                        <span class="form-hint">Deadline de entrega al cliente</span>
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label class="form-label">Cantidad de Activos</label>
                        <input class="form-input" type="number" id="apAssets" min="0" placeholder="ej: 15" value="${p.assetCount||''}" required>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Estado</label>
                        <select class="form-select" id="apStatus">
                            <option value="pendiente" ${(!p.status||p.status==='pendiente')?'selected':''}>📋 Pendiente</option>
                            <option value="en-progreso" ${p.status==='en-progreso'?'selected':''}>⚡ En Progreso</option>
                            <option value="entregado" ${p.status==='entregado'?'selected':''}>✅ Entregado</option>
                        </select>
                    </div>
                </div>
                <div class="form-group">
                    <label class="form-label" style="display:flex;align-items:center;gap:var(--space-sm);">
                        <span>Requiere VPN</span>
                    </label>
                    <div style="display:flex;gap:var(--space-md);align-items:center;">
                        <label style="display:flex;align-items:center;gap:var(--space-xs);cursor:pointer;font-family:var(--font-mono);font-size:var(--text-sm);color:var(--text-secondary);">
                            <input type="radio" name="vpn" value="yes" id="apVpnYes" ${p.vpn ? 'checked' : ''} style="accent-color:var(--neon-orange);width:16px;height:16px;">
                            🔒 Sí, con VPN
                        </label>
                        <label style="display:flex;align-items:center;gap:var(--space-xs);cursor:pointer;font-family:var(--font-mono);font-size:var(--text-sm);color:var(--text-secondary);">
                            <input type="radio" name="vpn" value="no" id="apVpnNo" ${!p.vpn ? 'checked' : ''} style="accent-color:var(--neon-cyan);width:16px;height:16px;">
                            🌐 No, sin VPN
                        </label>
                    </div>
                </div>
                <div class="form-group">
                    <label class="form-label">Notas (opcional)</label>
                    <input class="form-input" id="apNotes" placeholder="Observaciones, contacto del cliente, credenciales..." value="${p.notes||''}">
                </div>
                <button type="submit" class="btn btn-primary btn-block btn-lg mt-md">${existing?'Actualizar':'Agregar Proyecto'}</button>
            </form>`);

        $('adminProjForm').addEventListener('submit', e => {
            e.preventDefault();
            const proj = {
                id: p.id || _uid(),
                projectName: $('apName').value.trim(),
                pm: $('apPm').value.trim(),
                projectType: $('apType').value,
                testType: $('apTestType').value,
                assignee: $('apAssignee').value.trim(),
                arrivalDate: $('apArrival').value,
                deliveryDate: $('apDelivery').value,
                assetCount: parseInt($('apAssets').value) || 0,
                vpn: $('apVpnYes').checked,
                status: $('apStatus').value,
                notes: $('apNotes').value.trim(),
                createdAt: p.createdAt || new Date().toISOString(),
            };
            Storage.saveAdminProject(proj);
            closeModal();
            toast(existing ? 'Proyecto actualizado' : 'Proyecto agregado al panel');
            App.navigate('admin');
        });
    }

    return {
        toast, openModal, closeModal, confirmDialog, setActiveNav,
        renderWelcome, showProjectForm,
        renderDashboard, renderProjects, renderProjectDetail,
        renderCalendar, renderPlan, renderProgress, renderRegistry,
        showAssetForm, setViewMode,
        renderAdmin, showAdminProjectForm,
    };
})();
