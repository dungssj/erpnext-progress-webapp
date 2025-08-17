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
    f.from_date = searchParams.get('from_date');
    f.to_date = searchParams.get('to_date');
    f.project = searchParams.get('project');
    f.company = searchParams.get('company');
    f.comment_owner = searchParams.get('comment_owner');
    f.keyword = searchParams.get('keyword');
    const status = searchParams.get('task_status');
    f.task_status = status ? status.split(',').map(s => s.trim()).filter(Boolean) : ['Open','Working','Completed','Overdue','Pending Review'];
    const projectStatus = searchParams.get('project_status');
    f.project_status = projectStatus ? projectStatus.split(',').map(s => s.trim()).filter(Boolean) : [];
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
    // === LUỒNG LOGIC MỚI: TOP-DOWN (PROJECT -> TASK -> COMMENT) ===
    // ==================================================================

    /* BƯỚC 1: LẤY DANH SÁCH DỰ ÁN CUỐI CÙNG DỰA TRÊN BỘ LỌC */
    const projectFilters = [];
    if (filters.project) projectFilters.push(['name', '=', filters.project]);
    if (filters.company) projectFilters.push(['company', '=', filters.company]);
    if (filters.project_status && filters.project_status.length > 0) {
        projectFilters.push(['status', 'in', filters.project_status]);
    }

    const projects = await db.getDocList('Project', {
        fields: ['name','project_name','status','company','percent_complete'],
        filters: projectFilters.length > 0 ? projectFilters : undefined,
        limit: 10000
    });

    if (!projects || projects.length === 0) {
        return NextResponse.json([]); // Không có dự án nào khớp, trả về mảng rỗng
    }

    const projectMap = projects.reduce((acc, p) => {
        acc[p.name] = p;
        return acc;
    }, {});
    const projectIds = projects.map(p => p.name);

    /* BƯỚC 2: LẤY TẤT CẢ CÔNG VIỆC CỦA CÁC DỰ ÁN ĐÓ */
    let allTasks = [];
    if (projectIds.length > 0) {
        for (const part of chunk(projectIds, 50)) {
            const partTasks = await db.getDocList('Task', {
                fields: ['name','subject','status','progress','priority','is_group','project','parent_task','lft','rgt','custom_nguoi_phu_trach'],
                filters: [['project','in', part]],
                limit: 10000
            });
            allTasks = allTasks.concat(partTasks);
        }
    }
    
    // Áp dụng các bộ lọc task-level (nếu có)
    if (filters.task_status && filters.task_status.length > 0) {
        const set = new Set(filters.task_status.map(s => s.toLowerCase()));
        allTasks = allTasks.filter(t => set.has(String(t.status || '').toLowerCase()));
    }
    if (filters.leaf_only) {
        allTasks = allTasks.filter(t => !Number(t.is_group || 0));
    }
    // Lọc cho báo cáo cá nhân
    if (filters.comment_owner) {
        allTasks = allTasks.filter(t => emailInJsonList(t.custom_nguoi_phu_trach, filters.comment_owner));
    }

    /* BƯỚC 3: LẤY CÁC BÌNH LUẬN LIÊN QUAN ĐẾN CÁC CÔNG VIỆC ĐÃ LỌC */
    const taskNames = allTasks.map(t => t.name);
    let comments = [];
    if (taskNames.length > 0) {
        const commentFilters = [['reference_doctype', '=', 'Task'], ['comment_type', '=', 'Comment'], ['reference_name', 'in', taskNames]];
        if (filters.from_date) commentFilters.push(['creation', '>=', filters.from_date]);
        if (filters.to_date) commentFilters.push(['creation', '<', addOneDay(filters.to_date)]);
        if (filters.comment_owner) commentFilters.push(['owner', '=', filters.comment_owner]);

        comments = await db.getDocList('Comment', {
            fields: ['name','creation','owner','comment_type','content','reference_name'],
            filters: commentFilters,
            orderBy: { field: 'creation', order: 'asc' },
            limit: 10000,
        });
    }

    // Áp dụng các bộ lọc comment-level (nếu có)
    if (filters.keyword) {
        const kw = filters.keyword.toLowerCase();
        comments = comments.filter(c => stripHtml(c.content).toLowerCase().includes(kw));
    }
    if (filters.latest_only) {
        const latest = {};
        for (const c of comments) {
            const k = c.reference_name;
            if (!latest[k] || c.creation > latest[k].creation) latest[k] = c;
        }
        comments = Object.values(latest);
    }
    
    /* BƯỚC 4: TỔNG HỢP VÀ XÂY DỰNG CÂY DỮ LIỆU */
    const commentsByTask = new Map();
    for (const c of comments) {
        const arr = commentsByTask.get(c.reference_name) || [];
        arr.push(c);
        commentsByTask.set(c.reference_name, arr);
    }

    const tasksByProject = new Map();
    for (const t of allTasks) {
        const arr = tasksByProject.get(t.project) || [];
        arr.push(t);
        tasksByProject.set(t.project, arr);
    }

    function sortTasksForProject(list) {
        const hasTree = list.some(t => typeof t.lft === 'number' && t.lft !== null);
        if (hasTree) { return list.slice().sort((a, b) => (a.lft ?? 0) - (b.lft ?? 0)); }
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

    const finalTree = projects.map(p => {
        const taskListForProject = tasksByProject.get(p.name) || [];
        const taskTree = buildTaskTreeForProject(taskListForProject);
        return {
            ...p,
            project_id: p.name,
            // Nếu là báo cáo cá nhân, thêm trường responsible_email vào
            ...(filters.comment_owner && { responsible_email: filters.comment_owner }),
            tasks: taskTree
        };
    }).filter(p => {
        // Chỉ giữ lại những dự án có công việc sau khi đã lọc (cho báo cáo cá nhân)
        // Hoặc giữ lại tất cả dự án (cho báo cáo tổng hợp)
        return filters.comment_owner ? p.tasks.length > 0 : true;
    });

    return NextResponse.json(finalTree);

  } catch (error) {
    console.error('Lỗi API (report):', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
