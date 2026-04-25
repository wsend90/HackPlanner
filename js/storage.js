/* ============================================================
   STORAGE MODULE v2 — Multi-project LocalStorage persistence
   ============================================================ */

const Storage = (() => {
    const KEYS = {
        PROJECTS: 'hp_projects',
        ASSETS: 'hp_assets',
        PLANS: 'hp_plans',
        REGISTRY: 'hp_registry',
        VERSION: 'hp_version',
        ACTIVE_PROJECT: 'hp_active_project',
        ADMIN_PROJECTS: 'hp_admin_projects',
    };

    const CURRENT_VERSION = 2;

    function _save(key, data) {
        try { localStorage.setItem(key, JSON.stringify(data)); return true; }
        catch (e) { console.error(`[Storage] Error saving ${key}:`, e); return false; }
    }

    function _load(key) {
        try { const r = localStorage.getItem(key); return r ? JSON.parse(r) : null; }
        catch (e) { console.error(`[Storage] Error loading ${key}:`, e); return null; }
    }

    // ── Projects (array) ──
    function saveProjects(projects) { return _save(KEYS.PROJECTS, projects); }
    function loadProjects() { return _load(KEYS.PROJECTS) || []; }

    function saveProject(project) {
        const projects = loadProjects();
        const idx = projects.findIndex(p => p.id === project.id);
        project.updatedAt = new Date().toISOString();
        if (idx >= 0) projects[idx] = project;
        else projects.push(project);
        return saveProjects(projects);
    }

    function deleteProject(id) {
        const projects = loadProjects().filter(p => p.id !== id);
        saveProjects(projects);
        // Also clean assets and plans for this project
        const assets = loadAllAssets().filter(a => a.projectId !== id);
        _save(KEYS.ASSETS, assets);
        const plans = loadAllPlans();
        delete plans[id];
        _save(KEYS.PLANS, plans);
    }

    function getProject(id) {
        return loadProjects().find(p => p.id === id) || null;
    }

    // ── Assets (flat array, keyed by projectId) ──
    function loadAllAssets() { return _load(KEYS.ASSETS) || []; }
    function saveAllAssets(assets) { return _save(KEYS.ASSETS, assets); }

    function loadAssets(projectId) {
        return loadAllAssets().filter(a => a.projectId === projectId);
    }

    function saveAsset(asset) {
        const all = loadAllAssets();
        const idx = all.findIndex(a => a.id === asset.id);
        if (idx >= 0) all[idx] = asset;
        else all.push(asset);
        return saveAllAssets(all);
    }

    function deleteAsset(id) {
        const all = loadAllAssets().filter(a => a.id !== id);
        return saveAllAssets(all);
    }

    // ── Plans (object keyed by projectId) ──
    function loadAllPlans() { return _load(KEYS.PLANS) || {}; }
    function savePlan(projectId, plan) {
        const plans = loadAllPlans();
        plans[projectId] = plan;
        return _save(KEYS.PLANS, plans);
    }
    function loadPlan(projectId) {
        return loadAllPlans()[projectId] || null;
    }

    // ── Registry (completed projects archive) ──
    function loadRegistry() { return _load(KEYS.REGISTRY) || []; }
    function archiveProject(project, assets) {
        const registry = loadRegistry();
        const completed = assets.filter(a => a.status === 'completed').length;
        const retested = assets.filter(a => a.retestStatus === 'completed').length;
        registry.push({
            ...project,
            archivedAt: new Date().toISOString(),
            summary: {
                totalAssets: assets.length,
                completedAssets: completed,
                retestedAssets: retested,
            },
        });
        _save(KEYS.REGISTRY, registry);
        // Remove from active
        deleteProject(project.id);
    }

    function deleteRegistryEntry(archivedAt) {
        const registry = loadRegistry().filter(r => r.archivedAt !== archivedAt);
        _save(KEYS.REGISTRY, registry);
    }

    // ── Active project context ──
    function setActiveProject(id) { _save(KEYS.ACTIVE_PROJECT, id); }
    function getActiveProject() { return _load(KEYS.ACTIVE_PROJECT); }

    // ── Admin Projects (management tracking) ──
    function loadAdminProjects() { return _load(KEYS.ADMIN_PROJECTS) || []; }
    function saveAdminProjects(projects) { return _save(KEYS.ADMIN_PROJECTS, projects); }

    function saveAdminProject(project) {
        const all = loadAdminProjects();
        const idx = all.findIndex(p => p.id === project.id);
        project.updatedAt = new Date().toISOString();
        if (idx >= 0) all[idx] = project;
        else all.push(project);
        return saveAdminProjects(all);
    }

    function getAdminProject(id) {
        return loadAdminProjects().find(p => p.id === id) || null;
    }

    function deleteAdminProject(id) {
        const projects = loadAdminProjects().filter(p => p.id !== id);
        return saveAdminProjects(projects);
    }

    // ── Reset ──
    function resetAll() { Object.values(KEYS).forEach(k => localStorage.removeItem(k)); }

    // ── Backup ──
    function exportData() {
        const data = {};
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith('hp_')) {
                data[key] = localStorage.getItem(key);
            }
        }
        return JSON.stringify(data);
    }

    function importData(jsonString) {
        try {
            const data = JSON.parse(jsonString);
            for (const key in data) {
                if (key && key.startsWith('hp_')) {
                    localStorage.setItem(key, data[key]);
                }
            }
            return true;
        } catch (e) {
            console.error('[Storage] Error importing data:', e);
            return false;
        }
    }

    function init() {
        const v = _load(KEYS.VERSION);
        if (!v || v < CURRENT_VERSION) {
            // Migration: clear old v1 keys
            ['hackplanner_project','hackplanner_assets','hackplanner_plan','hackplanner_version'].forEach(k => localStorage.removeItem(k));
            _save(KEYS.VERSION, CURRENT_VERSION);
        }
    }

    return {
        saveProjects, loadProjects, saveProject, deleteProject, getProject,
        loadAllAssets, saveAllAssets, loadAssets, saveAsset, deleteAsset,
        loadAllPlans, savePlan, loadPlan,
        loadRegistry, archiveProject, deleteRegistryEntry,
        setActiveProject, getActiveProject,
        loadAdminProjects, saveAdminProjects, saveAdminProject, getAdminProject, deleteAdminProject,
        resetAll, init, exportData, importData,
    };
})();
