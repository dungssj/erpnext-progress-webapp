import { FrappeApp } from 'frappe-js-sdk';
import { NextResponse } from 'next/server';

// --- PHẦN HELPERS CHUNG ---
function stripHtml(html = '') {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim()
}

function sanitizeHtml(html = '') {
  return (html || '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
}

function chunk(arr, size = 200) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function addOneDay(dateStr) {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

// Helper mới cho báo cáo cá nhân
function emailInJsonList(raw, email) {
  if (!raw) return false;
  try {
    const arr = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!Array.isArray(arr)) return false;
    return arr.map(x => String(x).trim().toLowerCase()).includes(email.trim().toLowerCase());
  } catch {
    return false;
  }
}

function parseFilters(searchParams) {
    const f = {};
    f.from_date = searchParams.get('from_date') || searchParams.get('from');
    f.to_date = searchParams.get('to_date') || searchParams.get('to');
    f.project = searchParams.get('project');
    f.company = searchParams.get('company');
    f.comment_owner = searchParams.get('comment_owner') || searchParams.get('owner') || searchParams.get('email');
    f.keyword = searchParams.get('keyword') || searchParams.get('kw');
    const status = searchParams.get('task_status') || searchParams.get('status');
    f.task_status = status ? status.split(',').map(s => s.trim()).filter(Boolean) : ['Open','Working','Completed','Overdue','Pending Review'];
    f.leaf_only = searchParams.has('leaf');
    f.latest_only = searchParams.has('latest');
    return f;
}

// --- HÀM XỬ LÝ API CHÍNH ---
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const filters = parseFilters(searchParams);

    const FRAPPE_URL = process.env.FRAPPE_URL;
    const API_KEY = process.env.FRAPPE_API_KEY;
    const API_SECRET = process.env.FRAPPE_API_SECRET;

    if (!FRAPPE_URL || !API_KEY || !API_SECRET) {
      throw new Error('Thiếu FRAPPE_URL / FRAPPE_API_KEY / FRAPPE_API_SECRET trong .env');
    }

    const app = new FrappeApp(FRAPPE_URL, {
      useToken: true,
      token: () => `${API_KEY}:${API_SECRET}`,
      type: 'token'
    });
    const db = app.db();

    // ==================================================================
    // === LOGIC PHÂN LUỒNG: BÁO CÁO CÁ NHÂN HAY BÁO CÁO TỔNG HỢP? ===
    // ==================================================================

    if (filters.comment_owner) {
        // --- LOGIC BÁO CÁO CÁ NHÂN (THEO `custom_nguoi_phu_trach`) ---
        
        const email = filters.comment_owner;

        /* 1) Xác định tập Project theo --project/--company (nếu có) */
        const projectMap = {};
        const targetProjectIdSet = new Set();
        if (filters.project) targetProjectIdSet.add(filters.project);
        if (filters.company) {
            const companyProjects = await db.getDocList('Project', {
                fields: ['name','project_name','status','company','percent_complete'],
                filters: [['company','=', filters.company]],
                limit: 10000
            });
            for (const p of companyProjects) {
                targetProjectIdSet.add(p.name);
                projectMap[p.name] = p;
            }
        }

        /* 2) LẤY TẤT CẢ TASK người này phụ trách */
        const taskFilters = [];
        if (targetProjectIdSet.size) {
            taskFilters.push(['project', 'in', [...targetProjectIdSet]]);
        }
        taskFilters.push(['custom_nguoi_phu_trach', 'like', `%${email}%`]);

        let allTasks = await db.getDocList('Task', {
            fields: ['name','subject','status','progress','priority','is_group','project','parent_task','lft','rgt','custom_nguoi_phu_trach'],
            filters: taskFilters,
            limit: 10000
        });
        
        allTasks = allTasks.filter(t => emailInJsonList(t.custom_nguoi_phu_trach, email));

        if (filters.task_status?.length) {
            const set = new Set(filters.task_status.map(s => s.toLowerCase()));
            allTasks = allTasks.filter(t => set.has(String(t.status || '').toLowerCase()));
        }
        if (filters.leaf_only) {
            allTasks = allTasks.filter(t => !Number(t.is_group || 0));
        }

        if (!allTasks.length) {
            return NextResponse.json([]);
        }

        const projectIdsFromTasks = [...new Set(allTasks.map(t => t.project).filter(Boolean))];
        const missingProjects = projectIdsFromTasks.filter(pid => !projectMap[pid]);
        if (missingProjects.length) {
            for (const part of chunk(missingProjects)) {
                const partProjects = await db.getDocList('Project', {
                    fields: ['name','project_name','status','company','percent_complete'],
                    filters: [['name','in', part]],
                    limit: part.length,
                });
                for (const p of partProjects) projectMap[p.name] = p;
            }
        }
        if (filters.company) {
            allTasks = allTasks.filter(t => (projectMap[t.project]?.company || '') === filters.company);
        }

        /* 3) LẤY COMMENT của những Task đã lọc */
        const taskNames = [...new Set(allTasks.map(t => t.name))];
        let filteredComments = [];
        for (const part of chunk(taskNames, 400)) {
            const commentFilters = [
                ['reference_doctype', '=', 'Task'],
                ['reference_name', 'in', part],
                ['comment_type', '=', 'Comment'],
                ['owner', '=', email] // Lấy comment của chính người đó
            ];
            if (filters.from_date) commentFilters.push(['creation', '>=', filters.from_date]);
            if (filters.to_date) commentFilters.push(['creation', '<', addOneDay(filters.to_date)]);
            
            const batch = await db.getDocList('Comment', {
                fields: ['name','creation','owner','comment_type','content','reference_name'],
                filters: commentFilters,
                orderBy: { field: 'creation', order: 'asc' },
                limit: 10000,
            });
            filteredComments = filteredComments.concat(batch);
        }

        if (filters.keyword) {
            const kw = filters.keyword.toLowerCase();
            filteredComments = filteredComments.filter(c => stripHtml(c.content).toLowerCase().includes(kw));
        }
        if (filters.latest_only) {
            const latest = {};
            for (const c of filteredComments) {
                const k = c.reference_name;
                if (!latest[k] || c.creation > latest[k].creation) latest[k] = c;
            }
            filteredComments = Object.values(latest);
        }

        /* 4) Gom comment theo Task */
        const commentsByTask = new Map();
        for (const c of filteredComments) {
            const arr = commentsByTask.get(c.reference_name) || [];
            arr.push(c);
            commentsByTask.set(c.reference_name, arr);
        }

        // Các bước còn lại (Build tree, ghép project) tương tự logic báo cáo tổng hợp
        const tasksByProject = new Map();
        for (const t of allTasks) {
            const arr = tasksByProject.get(t.project) || [];
            arr.push(t);
            tasksByProject.set(t.project, arr);
        }

        function sortTasksForProject(list) {
            const hasTree = list.some(t => typeof t.lft === 'number' && t.lft !== null);
            if (hasTree) return list.slice().sort((a, b) => (a.lft ?? 0) - (b.lft ?? 0));
            return list.slice().sort((a, b) => (a.subject || '').localeCompare(b.subject || ''));
        }

        function buildTaskTreeForProject(taskList) {
            const nodes = new Map();
            const childrenMap = new Map();
            for (const t of taskList) {
                nodes.set(t.name, {
                    task_id: t.name, task_subject: t.subject, task_status: t.status,
                    is_group: !!Number(t.is_group || 0), comments: [], children: [],
                });
            }
            for (const t of taskList) {
                const node = nodes.get(t.name);
                const cmts = (commentsByTask.get(t.name) || []).slice().sort((a, b) => b.creation.localeCompare(a.creation));
                node.comments = cmts.map(c => ({
                    comment_time: c.creation, comment_owner: c.owner, comment_html: sanitizeHtml(c.content),
                }));
            }
            for (const t of taskList) {
                const parent = t.parent_task;
                if (parent && nodes.has(parent)) {
                    const arr = childrenMap.get(parent) || [];
                    arr.push(nodes.get(t.name));
                    childrenMap.set(parent, arr);
                }
            }
            for (const [p, kids] of childrenMap.entries()) {
                const parentNode = nodes.get(p);
                const orderedKids = sortTasksForProject(kids.map(k => ({ ...taskList.find(t => t.name === k.task_id), __node: k }))).map(x => x.__node);
                parentNode.children = orderedKids;
            }
            const taskNameSet = new Set(taskList.map(t => t.name));
            const roots = [];
            for (const t of taskList) {
                if (!t.parent_task || !taskNameSet.has(t.parent_task)) {
                    roots.push(nodes.get(t.name));
                }
            }
            return sortTasksForProject(roots.map(r => ({ ...taskList.find(t => t.name === r.task_id), __node: r }))).map(x => x.__node);
        }

        const sortedProjectIds = [...tasksByProject.keys()].sort((a, b) => {
            const pa = (projectMap[a] || {}).project_name || '';
            const pb = (projectMap[b] || {}).project_name || '';
            return pa.localeCompare(pb);
        });

        const tree = [];
        for (const pid of sortedProjectIds) {
            const p = projectMap[pid];
            if (!p) continue;
            const taskList = tasksByProject.get(pid) || [];
            const taskTree = buildTaskTreeForProject(taskList);
            if (taskTree.length > 0) { // Chỉ thêm project nếu có task liên quan
                 tree.push({
                    ...p, // Giữ lại các trường của project
                    project_id: p.name,
                    tasks: taskTree,
                });
            }
        }
        return NextResponse.json(tree);

    } else {
        // --- LOGIC BÁO CÁO TỔNG HỢP (LOGIC CŨ) ---
        
        /* 1) LẤY COMMENT TRƯỚC */
        const commentFilters = [['reference_doctype', '=', 'Task'], ['comment_type', '=', 'Comment']];
        if (filters.from_date) commentFilters.push(['creation', '>=', filters.from_date]);
        if (filters.to_date) commentFilters.push(['creation', '<', addOneDay(filters.to_date)]);
        
        let comments = await db.getDocList('Comment', {
            fields: ['name','creation','owner','comment_type','content','reference_name'],
            filters: commentFilters,
            orderBy: { field: 'creation', order: 'asc' },
            limit: 10000,
        });
        comments = comments.filter(c => String(c.comment_type || '').toLowerCase() === 'comment');

        /* 2) LẤY TASK CHO CÁC COMMENT */
        const taskMap = {};
        const commentTaskNames = [...new Set(comments.map(c => c.reference_name).filter(Boolean))];
        if (commentTaskNames.length) {
            for (const part of chunk(commentTaskNames)) {
                const partTasks = await db.getDocList('Task', {
                    fields: ['name','subject','status','progress','priority','is_group','project','parent_task','lft','rgt'],
                    filters: [['name','in', part]],
                    limit: part.length,
                });
                for (const t of partTasks) taskMap[t.name] = t;
            }
        }

        let filteredComments = comments.filter(c => taskMap[c.reference_name]);

        /* 3) XÁC ĐỊNH PROJECT MỤC TIÊU & NẠP PROJECT */
        const projectMap = {};
        const targetProjectIdSet = new Set();
        if (filters.project) targetProjectIdSet.add(filters.project);

        if (filters.company) {
            const companyProjects = await db.getDocList('Project', {
                fields: ['name','project_name','status','company','percent_complete'],
                filters: [['company','=', filters.company]],
                limit: 10000
            });
            for (const p of companyProjects) {
                targetProjectIdSet.add(p.name);
                projectMap[p.name] = p;
            }
        }

        for (const c of filteredComments) {
            const pid = taskMap[c.reference_name]?.project;
            if (pid) targetProjectIdSet.add(pid);
        }

        const projectIds = [...targetProjectIdSet];
        if (!projectIds.length && (filters.project || filters.company)) {
            if (filters.project) projectIds.push(filters.project);
            if (projectMap) {
                Object.keys(projectMap).forEach(pId => {
                    if (!projectIds.includes(pId)) projectIds.push(pId);
                })
            }
        } else if (!projectIds.length) {
            return NextResponse.json([]);
        }

        const missingProjects = projectIds.filter(pid => !projectMap[pid]);
        if (missingProjects.length) {
            for (const part of chunk(missingProjects)) {
                const partProjects = await db.getDocList('Project', {
                    fields: ['name','project_name','status','company','percent_complete'],
                    filters: [['name','in', part]],
                    limit: part.length,
                });
                for (const p of partProjects) projectMap[p.name] = p;
            }
        }

        filteredComments = filteredComments.filter(c => {
            const pid = taskMap[c.reference_name]?.project;
            return pid && targetProjectIdSet.has(pid);
        });

        /* 4) LẤY TẤT CẢ TASK CỦA PROJECT MỤC TIÊU */
        let allTasks = [];
        if (projectIds.length > 0) {
            for (const part of chunk(projectIds, 50)) {
                const partTasks = await db.getDocList('Task', {
                    fields: ['name','subject','status','progress','priority','is_group','project','parent_task','lft','rgt'],
                    filters: [['project','in', part]],
                    limit: 10000
                });
                allTasks = allTasks.concat(partTasks);
            }
        }

        if (filters.task_status && filters.task_status.length) {
            const set = new Set(filters.task_status.map(s => s.toLowerCase()));
            allTasks = allTasks.filter(t => set.has(String(t.status || '').toLowerCase()));
        }
        if (filters.leaf_only) {
            allTasks = allTasks.filter(t => !Number(t.is_group || 0));
        }

        for (const t of allTasks) taskMap[t.name] = t;

        /* 5) Áp filter keyword trên COMMENT */
        if (filters.keyword) {
            const kw = filters.keyword.toLowerCase();
            filteredComments = filteredComments.filter(c => stripHtml(c.content).toLowerCase().includes(kw));
        }

        if (filters.latest_only) {
            const latest = {};
            for (const c of filteredComments) {
                const k = c.reference_name;
                if (!latest[k] || c.creation > latest[k].creation) latest[k] = c;
            }
            filteredComments = Object.values(latest);
        }

        /* 6) GOM COMMENT THEO TASK */
        const commentsByTask = new Map();
        for (const c of filteredComments) {
            const arr = commentsByTask.get(c.reference_name) || [];
            arr.push(c);
            commentsByTask.set(c.reference_name, arr);
        }

        /* 7) XÂY CÂY TASK CHA–CON */
        const tasksByProject = new Map();
        for (const t of allTasks) {
            const arr = tasksByProject.get(t.project) || [];
            arr.push(t);
            tasksByProject.set(t.project, arr);
        }

        function sortTasksForProject(list) {
            const hasTree = list.some(t => typeof t.lft === 'number' && t.lft !== null);
            if (hasTree) {
                return list.slice().sort((a, b) => (a.lft ?? 0) - (b.lft ?? 0));
            }
            return list.slice().sort((a, b) => (a.subject || '').localeCompare(b.subject || ''));
        }

        function buildTaskTreeForProject(taskList) {
            const nodes = new Map();
            const childrenMap = new Map();
            for (const t of taskList) {
                nodes.set(t.name, {
                    task_id: t.name, task_subject: t.subject, task_status: t.status,
                    is_group: !!Number(t.is_group || 0), comments: [], children: [],
                });
            }
            for (const t of taskList) {
                const node = nodes.get(t.name);
                const cmts = (commentsByTask.get(t.name) || []).slice().sort((a, b) => b.creation.localeCompare(a.creation));
                node.comments = cmts.map(c => ({
                    comment_time: c.creation, comment_owner: c.owner, comment_html: sanitizeHtml(c.content),
                }));
            }
            for (const t of taskList) {
                const parent = t.parent_task;
                if (parent && nodes.has(parent)) {
                    const arr = childrenMap.get(parent) || [];
                    arr.push(nodes.get(t.name));
                    childrenMap.set(parent, arr);
                }
            }
            for (const [p, kids] of childrenMap.entries()) {
                const parentNode = nodes.get(p);
                const orderedKids = sortTasksForProject(kids.map(k => ({ ...taskList.find(t => t.name === k.task_id), __node: k }))).map(x => x.__node);
                parentNode.children = orderedKids;
            }
            const taskNameSet = new Set(taskList.map(t => t.name));
            const roots = [];
            for (const t of taskList) {
                if (!t.parent_task || !taskNameSet.has(t.parent_task)) {
                    roots.push(nodes.get(t.name));
                }
            }
            return sortTasksForProject(roots.map(r => ({ ...taskList.find(t => t.name === r.task_id), __node: r }))).map(x => x.__node);
        }

        /* 8) GHÉP PROJECT → TASK TREE */
        const sortedProjectIds = [...tasksByProject.keys()].sort((a, b) => {
            const pa = (projectMap[a] || {}).project_name || '';
            const pb = (projectMap[b] || {}).project_name || '';
            return pa.localeCompare(pb);
        });

        const tree = [];
        for (const pid of sortedProjectIds) {
            const p = projectMap[pid];
            if (!p) continue;
            const taskList = tasksByProject.get(pid) || [];
            const taskTree = buildTaskTreeForProject(taskList);
            tree.push({
                ...p,
                project_id: p.name,
                tasks: taskTree,
            });
        }
        return NextResponse.json(tree);
    }

  } catch (error) {
    console.error('Lỗi API (report):', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
