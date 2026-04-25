/* ============================================================
   PLANNER MODULE v2 — Multi-project planning engine
   No difficulty weighting — flat daysEstimated per asset
   ============================================================ */

const Planner = (() => {

    /**
     * Generate a daily plan for a project.
     * Assets are distributed based on their daysEstimated field.
     */
    function generatePlan(project, assets) {
        if (!assets.length || !project.totalDays) return null;

        const isRetestPhase = project.phase === 'retest';
        let pendingAssets = assets.filter(a => {
            if (isRetestPhase) return a.retestStatus && a.retestStatus !== 'completed' && a.retestStatus !== 'null' && a.retestStatus !== 'undefined';
            
            const needsNormalWork = a.status !== 'completed';
            const needsRetestWork = a.retestStatus === 'pending' || a.retestStatus === 'in-progress';
            return needsNormalWork || needsRetestWork;
        });
        
        if (pendingAssets.length === 0) return _emptyPlan(project);

        const days = [];
        const totalHackingDays = Math.round(project.totalDays * (project.hackingPct / 100));

        let assetQueue = [...pendingAssets];
        // Prioritize in-progress tasks (retest in-progress > normal in-progress > retest pending > normal pending)
        assetQueue.sort((a,b) => {
            const getRank = (asset) => {
                if (asset.retestStatus === 'in-progress') return 1;
                if (asset.status === 'in-progress') return 2;
                if (asset.retestStatus === 'pending') return 3;
                return 4; // status pending
            };
            return getRank(a) - getRank(b);
        });

        // Calculate how many assets in parallel per day
        // Total asset-days needed
        const totalAssetDays = assetQueue.reduce((s, a) => s + (a.daysEstimated || 3), 0);
        // We can possibly schedule overlapping assets if totalAssetDays > totalDays
        const parallelFactor = Math.max(1, Math.ceil(totalAssetDays / project.totalDays));

        // Simple scheduling: assign assets sequentially, each spanning its daysEstimated
        const schedule = []; // { assetId, startDay, endDay }
        let currentStart = 0;

        for (const asset of assetQueue) {
            const dur = asset.daysEstimated || 3;
            schedule.push({
                assetId: asset.id,
                assetName: asset.name,
                startDay: currentStart + 1,
                endDay: currentStart + dur,
                daysEstimated: dur,
                status: asset.status,
                retestStatus: asset.retestStatus,
            });
            currentStart += dur;
        }

        // Compress schedule to fit within totalDays if needed
        const totalNeeded = currentStart;
        const compressionRatio = totalNeeded > project.totalDays
            ? project.totalDays / totalNeeded
            : 1;

        if (compressionRatio < 1) {
            let accumulated = 0;
            for (const s of schedule) {
                const compressedDur = Math.max(1, Math.round(s.daysEstimated * compressionRatio));
                s.startDay = accumulated + 1;
                s.endDay = accumulated + compressedDur;
                s.daysEstimated = compressedDur;
                accumulated += compressedDur;
            }
        }

        // Build day cards
        const maxDay = Math.min(
            Math.max(...schedule.map(s => s.endDay), project.totalDays),
            project.totalDays
        );

        for (let d = 1; d <= maxDay; d++) {
            const dayAssets = schedule.filter(s => d >= s.startDay && d <= s.endDay);
            const isHacking = d <= totalHackingDays;
            
            days.push({
                dayNumber: d,
                date: _addDays(project.startDate, d - 1),
                hackingHours: isHacking ? project.hoursPerDay : 0,
                docHours: !isHacking ? project.hoursPerDay : 0,
                assets: dayAssets,
            });
        }

        return {
            days,
            schedule,
            totalAssetDays,
            generatedAt: new Date().toISOString(),
        };
    }

    function _emptyPlan(project) {
        return { days: [], schedule: [], hackingHours: 0, docHours: 0, totalAssetDays: 0, generatedAt: new Date().toISOString() };
    }

    /**
     * Replan from currentDay forward.
     */
    function replan(project, allAssets, currentDay) {
        const isRetestPhase = project.phase === 'retest';
        const remaining = allAssets.filter(a => {
            if (isRetestPhase) return a.retestStatus && a.retestStatus !== 'completed' && a.retestStatus !== 'null' && a.retestStatus !== 'undefined';
            
            const needsNormalWork = a.status !== 'completed';
            const needsRetestWork = a.retestStatus === 'pending' || a.retestStatus === 'in-progress';
            return needsNormalWork || needsRetestWork;
        });
        const remainingDays = Math.max(1, project.totalDays - (currentDay - 1));

        const virtualProject = {
            ...project,
            totalDays: remainingDays,
            startDate: _addDays(project.startDate, currentDay - 1),
            phase: project.phase // preserve phase
        };

        const newPlan = generatePlan(virtualProject, remaining);
        if (newPlan) {
            newPlan.days.forEach((d, i) => { d.dayNumber = currentDay + i; });
            newPlan.schedule.forEach(s => {
                s.startDay += (currentDay - 1);
                s.endDay += (currentDay - 1);
            });
        }
        return newPlan;
    }

    /**
     * Calculate metrics for a single project.
     */
    function getProjectMetrics(project, assets) {
        let total = assets.length;
        let completed = assets.filter(a => a.status === 'completed').length;
        let inProgress = assets.filter(a => a.status === 'in-progress').length;
        
        const retestAssets = assets.filter(a => a.retestStatus && a.retestStatus !== 'null' && a.retestStatus !== 'undefined');
        const retest = retestAssets.length;
        const retestCompleted = retestAssets.filter(a => a.retestStatus === 'completed').length;

        const isRetestPhase = project.phase === 'retest';
        if (isRetestPhase) {
            total = retest;
            completed = retestCompleted;
            inProgress = retestAssets.filter(a => a.retestStatus === 'in-progress').length;
        }

        const progressPct = total > 0 ? Math.round((completed / total) * 100) : 0;

        const startDateStr = isRetestPhase ? (project.retestStartDate || project.startDate) : project.startDate;
        const startDate = new Date(startDateStr + 'T00:00:00');
        
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        // Calculate dynamic total days based on the dates
        let totalDays = project.totalDays;
        let endDateStr = project.endDate || _addDays(project.startDate, project.totalDays - 1);
        
        if (isRetestPhase && project.retestEndDate) {
            endDateStr = project.retestEndDate;
            totalDays = countBusinessDays(startDateStr, endDateStr);
        }

        const elapsed = today >= startDate ? countBusinessDays(startDateStr, today.toISOString().split('T')[0]) : 0;
        const currentDay = Math.max(1, Math.min(elapsed, totalDays));

        const endDate = new Date(endDateStr + 'T00:00:00');
        endDate.setHours(0, 0, 0, 0);
        
        const remainingDays = today > endDate ? 0 : countBusinessDays(today.toISOString().split('T')[0], endDateStr);

        // Is project delayed? The deadline has passed and there is pending work
        const isDelayed = today.getTime() > endDate.getTime() && completed < total;

        // Auto-detect project status
        let computedStatus = project.status || 'active';
        if (completed === total && total > 0) computedStatus = 'completed';
        else if (isDelayed) computedStatus = 'delayed';

        // Pace based on remaining work vs remaining timeframe (working hours)
        const pendingAssets = assets.filter(a => a.status !== 'completed');
        const neededHours = pendingAssets.reduce((sum, a) => sum + (a.daysEstimated||3)*9, 0);
        
        let remWorkDays = 0;
        let curDate = new Date(Math.max(today.getTime(), startDate.getTime()));
        while(curDate <= endDate) {
            if(curDate.getDay() !== 0 && curDate.getDay() !== 6) remWorkDays++;
            curDate.setDate(curDate.getDate() + 1);
        }
        
        let pace = 'on-track';
        // If we need more hours than we have available working days * 9h
        if (neededHours > remWorkDays * 9) pace = 'behind';
        else if (progressPct > 0 && neededHours < (remWorkDays * 9) * 0.5) pace = 'ahead';

        return {
            total, completed, inProgress,
            pending: total - completed - inProgress,
            retest, retestCompleted,
            progressPct, currentDay, remainingDays,
            endDate: endDateStr, expectedPct: progressPct, pace, isDelayed, computedStatus,
        };
    }

    /**
     * Get global metrics across all projects.
     */
    function getGlobalMetrics(projects, allAssets) {
        let delayedProjects = 0;
        let totalAssets = 0;
        let completedAssets = 0;
        let inProgressAssets = 0;
        let activeProjectsCount = 0;
        
        let historicalTotalAssets = allAssets.length;
        let historicalCompletedAssets = allAssets.filter(a => a.status === 'completed').length;

        for (const p of projects) {
            if (p.status === 'completed') continue;
            
            const pAssets = allAssets.filter(a => a.projectId === p.id);
            const m = getProjectMetrics(p, pAssets);
            
            if (m.computedStatus === 'completed') continue;
            
            activeProjectsCount++;
            if (m.isDelayed || m.pace === 'behind') delayedProjects++;
            
            totalAssets += m.total;
            completedAssets += m.completed;
            inProgressAssets += m.inProgress;
        }

        return {
            totalProjects: projects.length,
            activeProjects: activeProjectsCount,
            delayedProjects,
            totalAssets,
            completedAssets,
            inProgressAssets,
            historicalTotalAssets,
            historicalCompletedAssets,
            pendingAssets: totalAssets - completedAssets - inProgressAssets,
            globalProgressPct: totalAssets > 0 ? Math.round((completedAssets / totalAssets) * 100) : 0,
        };
    }

    /**
     * Get today's tasks for a project.
     */
    function getTodayTasks(plan, project) {
        if (!plan || !plan.days) return null;
        const startDateStr = project.startDate;
        const startDate = new Date(startDateStr + 'T00:00:00');
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        if (today < startDate) return null;
        const elapsed = countBusinessDays(startDateStr, today.toISOString().split('T')[0]);
        return plan.days.find(d => d.dayNumber === elapsed) || null;
    }

    // ── Priority-based date shifting ──
    function shiftLowerPriorityDates(projects, newProject) {
        // Projects with lower priority (higher number) that overlap get pushed
        const newEnd = new Date(_addDays(newProject.startDate, newProject.totalDays - 1));
        return projects.map(p => {
            if (p.id === newProject.id) return p;
            if ((p.priority || 2) > (newProject.priority || 2)) {
                const pStart = new Date(p.startDate);
                if (pStart <= newEnd) {
                    // Shift this project to start after the new project ends
                    p.startDate = _addDays(newProject.startDate, newProject.totalDays);
                    p.updatedAt = new Date().toISOString();
                }
            }
            return p;
        });
    }

    function countBusinessDays(startStr, endStr) {
        const start = new Date(startStr + 'T00:00:00');
        const end = new Date(endStr + 'T00:00:00');
        if (start > end) return 0;
        let count = 0;
        let cur = new Date(start);
        while (cur <= end) {
            if (cur.getDay() !== 0 && cur.getDay() !== 6) count++;
            cur.setDate(cur.getDate() + 1);
        }
        return Math.max(1, count); // return at least 1 day if they are valid dates but maybe on weekend
    }

    function _addDays(dateStr, addDays) {
        let d = new Date(dateStr + 'T00:00:00');
        let added = 0;
        while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
        while (added < addDays) {
            d.setDate(d.getDate() + 1);
            if (d.getDay() !== 0 && d.getDay() !== 6) added++;
        }
        return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    }

    /**
     * Generate a global calendar for all active projects
     * 9 hours/day (8am-12pm, 1pm-6pm). Skips weekends. Distributes by priority.
     */
    function generateGlobalCalendar(projects, allAssets) {
        const activeProjects = projects.filter(p => p.status !== 'completed');
        
        let pendingWork = activeProjects.map(p => {
            const isRetestPhase = p.phase === 'retest';
            const pAssets = allAssets.filter(a => {
                if (a.projectId !== p.id) return false;
                if (isRetestPhase) return a.retestStatus && a.retestStatus !== 'completed' && a.retestStatus !== 'null' && a.retestStatus !== 'undefined';
                
                const needsNormalWork = a.status !== 'completed';
                const needsRetestWork = a.retestStatus === 'pending' || a.retestStatus === 'in-progress';
                return needsNormalWork || needsRetestWork;
            });
            
            let estHours = pAssets.reduce((sum, a) => {
                const isAssetRetesting = isRetestPhase || a.retestStatus === 'in-progress' || a.retestStatus === 'pending';
                let est = (a.daysEstimated || 3) * 9;
                if (isAssetRetesting) est = est * 0.2;
                return sum + est;
            }, 0);

            let endDateStr = isRetestPhase ? (p.retestEndDate || p.endDate) : p.endDate;
            if (!endDateStr && p.totalDays) {
                endDateStr = _addDays(p.startDate, p.totalDays - 1);
            }

            return { 
                project: p, 
                estHours: estHours,
                endDateStr: endDateStr,
                priority: p.priority||2, 
                name: p.name,
                docPct: p.docPct,
                hasInProgress: pAssets.some(a => a.retestStatus === 'in-progress' || a.status === 'in-progress')
            };
        }).filter(pw => pw.estHours > 0);

        // Sort sequentially: Priority > InProgress > Deadline > ID
        pendingWork.sort((a,b) => {
            if (a.priority !== b.priority) return a.priority - b.priority;
            if (a.hasInProgress !== b.hasInProgress) return a.hasInProgress ? -1 : 1;
            const aEnd = new Date(a.endDateStr || a.project.startDate).getTime();
            const bEnd = new Date(b.endDateStr || b.project.startDate).getTime();
            if (aEnd !== bEnd) return aEnd - bEnd;
            return a.project.id.localeCompare(b.project.id);
        });

        // Simulate timeline to compress deadlines iteratively
        let simCurrentStr = new Date().toISOString().split('T')[0];
        
        pendingWork.forEach(pw => {
            if (pw.endDateStr) {
                const availableDays = countBusinessDays(simCurrentStr, pw.endDateStr);
                const availableHours = availableDays * 9;
                
                if (availableHours > 0 && pw.estHours > availableHours) {
                    pw.estHours = availableHours;
                } else if (availableHours === 0 && pw.estHours > 9) {
                    // Si ya está super atrasado (la simulación lo arranca después de su deadline), dejar testarudo al menos 1 día
                    // Opcionalmente: pw.estHours = 9; (lo dejamos fluir por no borrarlo, pero lo limitamos para no saturar todo el calendario tardío)
                }
            }
            
            const daysUsed = Math.ceil(pw.estHours / 9) || 1;
            simCurrentStr = _addDays(simCurrentStr, daysUsed);

            let docHours = pw.estHours * (pw.docPct / 100);
            let hackingHours = pw.estHours - docHours;
            
            pw.hackingRemaining = parseFloat(hackingHours.toFixed(1));
            pw.docRemaining = parseFloat(docHours.toFixed(1));
            pw.totalRemaining = parseFloat((pw.hackingRemaining + pw.docRemaining).toFixed(1));
        });

        pendingWork = pendingWork.filter(pw => pw.totalRemaining > 0);

        const calendarDays = [];
        let currentDate = new Date();
        currentDate.setHours(0,0,0,0);
        
        let daysGenerated = 0;
        // Generate up to 90 days forward
        while(pendingWork.length > 0 && daysGenerated < 90) {
            // skip weekends
            if (currentDate.getDay() === 0 || currentDate.getDay() === 6) {
                currentDate.setDate(currentDate.getDate() + 1);
                continue;
            }

            let dayHoursRemaining = 9;
            let dayBlocks = [];

            while(dayHoursRemaining > 0 && pendingWork.length > 0) {
                // sort sequentially: Priority first, then In-Progress flag, then Deadline, then ID to keep same project across days
                pendingWork.sort((a,b) => {
                    if (a.priority !== b.priority) return a.priority - b.priority;
                    if (a.hasInProgress !== b.hasInProgress) return a.hasInProgress ? -1 : 1;
                    const aEnd = new Date(a.project.endDate || a.project.startDate).getTime();
                    const bEnd = new Date(b.project.endDate || b.project.startDate).getTime();
                    if (aEnd !== bEnd) return aEnd - bEnd;
                    return a.project.id.localeCompare(b.project.id);
                });

                const target = pendingWork[0];
                
                let chunk = 0;
                let isHacking = false;
                
                if (target.hackingRemaining > 0) {
                    chunk = Math.min(dayHoursRemaining, target.hackingRemaining);
                    target.hackingRemaining -= chunk;
                    isHacking = true;
                } else if (target.docRemaining > 0) {
                    chunk = Math.min(dayHoursRemaining, target.docRemaining);
                    target.docRemaining -= chunk;
                }
                
                const finalHours = parseFloat(chunk.toFixed(1));
                if (finalHours > 0) {
                    dayBlocks.push({
                        projectName: target.name,
                        projectId: target.project.id,
                        hours: finalHours,
                        priority: target.priority,
                        type: isHacking ? 'Hacking' : 'Documentación'
                    });
                }
                
                target.totalRemaining = parseFloat((target.totalRemaining - chunk).toFixed(1));
                dayHoursRemaining = parseFloat((dayHoursRemaining - chunk).toFixed(1));
                
                if (target.totalRemaining <= 0 || chunk <= 0) {
                    pendingWork.shift();
                    break; // Finaliza este día para no meter otro cliente en las horas restantes
                }
            }
            
            calendarDays.push({
                date: new Date(currentDate),
                blocks: dayBlocks
            });

            currentDate.setDate(currentDate.getDate() + 1);
            daysGenerated++;
        }
        
        return calendarDays;
    }

    return {
        generatePlan, replan, countBusinessDays,
        getProjectMetrics, getGlobalMetrics,
        getTodayTasks, shiftLowerPriorityDates,
        generateGlobalCalendar,
    };
})();
