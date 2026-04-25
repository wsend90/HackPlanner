/* ============================================================
   APP MODULE v2 — Multi-project routing & orchestration
   ============================================================ */

const App = (() => {
    let currentView = 'dashboard';
    let currentProjectId = null;

    function init() {
        Storage.init();

        // Modal
        document.getElementById('modalClose').addEventListener('click', UI.closeModal);
        document.getElementById('modalOverlay').addEventListener('click', e => { if (e.target === e.currentTarget) UI.closeModal(); });
        document.addEventListener('keydown', e => { if (e.key === 'Escape') UI.closeModal(); });

        // Hash routing
        window.addEventListener('hashchange', () => {
            const hash = location.hash.replace('#', '') || 'dashboard';
            navigate(hash, false);
        });

        // Nav clicks
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', e => {
                e.preventDefault();
                location.hash = '#' + item.dataset.view;
            });
        });

        // Backup
        const btnExport = document.getElementById('btnExportBackup');
        if (btnExport) {
            btnExport.addEventListener('click', () => {
                const data = Storage.exportData();
                const blob = new Blob([data], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `hackplanner_backup_${new Date().toISOString().split('T')[0]}.json`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                UI.toast('Backup exportado exitosamente', 'success');
            });
        }

        const inputImport = document.getElementById('fileImportBackup');
        if (inputImport) {
            inputImport.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = (ev) => {
                    const success = Storage.importData(ev.target.result);
                    if (success) {
                        UI.toast('Datos importados correctamente. Recargando...', 'success');
                        setTimeout(() => location.reload(), 1500);
                    } else {
                        UI.toast('Error al importar el archivo JSON', 'error');
                    }
                };
                reader.readAsText(file);
                e.target.value = ''; // Reset input
            });
        }

        const hash = location.hash.replace('#', '') || 'dashboard';
        navigate(hash, false);
    }

    function navigate(viewName, pushHash = true) {
        currentView = viewName;
        if (pushHash) location.hash = '#' + viewName;

        const projects = Storage.loadProjects();

        // Parse project detail route: project/ID
        if (viewName.startsWith('project/')) {
            currentProjectId = viewName.split('/')[1];
            UI.setActiveNav('projects');
            UI.renderProjectDetail(currentProjectId);
            return;
        }

        // Highlight nav
        UI.setActiveNav(viewName);

        // No projects? show welcome (except registry and admin)
        if (projects.length === 0 && viewName !== 'registry' && viewName !== 'admin') {
            UI.renderWelcome();
            return;
        }

        switch (viewName) {
            case 'dashboard':  UI.renderDashboard(); break;
            case 'projects':   UI.renderProjects(); break;
            case 'calendar':   if (UI.renderCalendar) UI.renderCalendar(); break;
            case 'plan':       UI.renderPlan(); break;
            case 'progress':   UI.renderProgress(); break;
            case 'registry':   UI.renderRegistry(); break;
            case 'admin':      UI.renderAdmin(); break;
            default:           UI.renderDashboard(); break;
        }
    }

    // ── Asset status cycle ──
    function cycleAssetStatus(assetId) {
        const all = Storage.loadAllAssets();
        const asset = all.find(a => a.id === assetId);
        if (!asset) return;

        const cycle = { 'pending':'in-progress', 'in-progress':'completed', 'completed':'pending' };
        asset.status = cycle[asset.status] || 'pending';
        if (asset.status === 'completed') asset.completedAt = new Date().toISOString();
        asset.updatedAt = new Date().toISOString();
        Storage.saveAllAssets(all);

        const labels = { 'pending':'Pendiente', 'in-progress':'En curso', 'completed':'Completado' };
        UI.toast(`${asset.name}: ${labels[asset.status]}`, asset.status === 'completed' ? 'success' : 'info');
        navigate(currentView, false);
    }

    // ── Retest toggle ──
    function toggleRetest(assetId) {
        const all = Storage.loadAllAssets();
        const asset = all.find(a => a.id === assetId);
        if (!asset) return;

        // Cycle retest: null → pending → in-progress → completed → null
        const cycle = { null:'pending', undefined:'pending', 'pending':'in-progress', 'in-progress':'completed', 'completed':null };
        asset.retestStatus = cycle[asset.retestStatus];
        asset.updatedAt = new Date().toISOString();
        Storage.saveAllAssets(all);

        if (asset.retestStatus) {
            const labels = { 'pending':'Retest pendiente', 'in-progress':'Retest en curso', 'completed':'Retest completado' };
            UI.toast(`${asset.name}: ${labels[asset.retestStatus]}`, 'info');
        } else {
            UI.toast(`${asset.name}: Retest removido`, 'info');
        }
        navigate(currentView, false);
    }

    // ── Delete asset ──
    function deleteAsset(assetId) {
        const all = Storage.loadAllAssets();
        const asset = all.find(a => a.id === assetId);
        if (!asset) return;
        UI.confirmDialog('Eliminar Activo', `Eliminar "${asset.name}"?`, () => {
            Storage.deleteAsset(assetId);
            // Regen plan
            const proj = Storage.getProject(asset.projectId);
            if (proj) {
                const assets = Storage.loadAssets(asset.projectId);
                const plan = Planner.generatePlan(proj, assets);
                Storage.savePlan(asset.projectId, plan);
            }
            UI.toast('Activo eliminado', 'info');
            navigate(currentView, false);
        });
    }

    // ── Regenerate plan ──
    function regeneratePlan(projectId) {
        const p = Storage.getProject(projectId);
        const assets = Storage.loadAssets(projectId);
        if (!p || !assets.length) { UI.toast('Agrega activos primero', 'error'); return; }
        const m = Planner.getProjectMetrics(p, assets);
        const plan = Planner.replan(p, assets, m.currentDay);
        if (plan) { Storage.savePlan(projectId, plan); UI.toast('Plan regenerado', 'success'); }
        navigate(currentView, false);
    }

    // ── Archive project ──
    function archiveProject(projectId) {
        const p = Storage.getProject(projectId);
        if (!p) return;
        UI.confirmDialog('Archivar Proyecto', `Archivar "${p.name}"? Se movera al registro historico.`, () => {
            const assets = Storage.loadAssets(projectId);
            Storage.archiveProject(p, assets);
            UI.toast('Proyecto archivado', 'success');
            navigate('projects');
        });
    }

    // ── Remove project ──
    function removeProject(projectId) {
        const p = Storage.getProject(projectId);
        if (!p) return;
        UI.confirmDialog('Eliminar Proyecto', `Eliminar "${p.name}" permanentemente? Se perderan todos los datos.`, () => {
            Storage.deleteProject(projectId);
            UI.toast('Proyecto eliminado', 'info');
            navigate('projects');
        });
    }

    // ── Remove from registry ──
    function removeRegistryEntry(archivedAt) {
        UI.confirmDialog('Eliminar del Registro', '¿Eliminar este proyecto del historial permanentemente?', () => {
            Storage.deleteRegistryEntry(archivedAt);
            UI.toast('Entrada eliminada', 'info');
            navigate('registry');
        });
    }

    // ── Admin project delete ──
    function deleteAdminProject(id) {
        const p = Storage.getAdminProject(id);
        if (!p) return;
        UI.confirmDialog('Eliminar Proyecto Administrativo', `¿Eliminar "${p.projectName}" del panel de administración?`, () => {
            Storage.deleteAdminProject(id);
            UI.toast('Proyecto eliminado del panel', 'info');
            navigate('admin');
        });
    }

    // ── Toggle admin project status ──
    function cycleAdminStatus(id) {
        const p = Storage.getAdminProject(id);
        if (!p) return;
        const cycle = { 'pendiente':'en-progreso', 'en-progreso':'entregado', 'entregado':'pendiente' };
        p.status = cycle[p.status] || 'pendiente';
        p.updatedAt = new Date().toISOString();
        Storage.saveAdminProject(p);
        const labels = { 'pendiente':'Pendiente', 'en-progreso':'En Progreso', 'entregado':'Entregado' };
        UI.toast(`${p.projectName}: ${labels[p.status]}`, p.status === 'entregado' ? 'success' : 'info');
        navigate('admin');
    }

    // ── Start Retest Phase ──
    function startRetestPhase(projectId) {
        const p = Storage.getProject(projectId);
        if (!p) return;
        
        const today = new Date().toISOString().split('T')[0];
        
        UI.openModal('Iniciar Fase de Retest', `
            <form id="retestForm" autocomplete="off">
                <p style="color:var(--text-secondary);margin-bottom:var(--space-md);">El proyecto ha finalizado sus auditorias regulares. Configura el marco de tiempo para los retests.</p>
                <div class="form-row">
                    <div class="form-group">
                        <label class="form-label">Fecha de Inicio Retest</label>
                        <input class="form-input" type="date" id="rStart" value="${today}" required>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Fecha de Entrega Retest</label>
                        <input class="form-input" type="date" id="rEnd" required>
                    </div>
                </div>
                <button type="submit" class="btn btn-orange btn-block btn-lg mt-md">Comenzar Retest</button>
            </form>`);
            
        document.getElementById('retestForm').addEventListener('submit', e => {
            e.preventDefault();
            const start = document.getElementById('rStart').value;
            const end = document.getElementById('rEnd').value;
            if (end <= start) { UI.toast('La fecha de entrega debe ser posterior al inicio', 'error'); return; }
            
            p.phase = 'retest';
            p.retestStartDate = start;
            p.retestEndDate = end;
            Storage.saveProject(p);
            
            UI.closeModal();
            UI.toast('Fase de Retest iniciada', 'success');
            navigate('project/' + projectId);
        });
    }

    return { init, navigate, cycleAssetStatus, toggleRetest, deleteAsset, regeneratePlan, archiveProject, removeProject, removeRegistryEntry, startRetestPhase, deleteAdminProject, cycleAdminStatus };
})();

document.addEventListener('DOMContentLoaded', App.init);
