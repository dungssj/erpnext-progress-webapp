import React from 'react';

// --- COMPONENT ĐỆ QUY ĐỂ RENDER CÂY CÔNG VIỆC ---
// Component này giờ đây xử lý cả hai loại báo cáo
function TaskTree({ tasks, level = 0, ownerEmail = null }) {
    if (!tasks || tasks.length === 0) {
        return null;
    }

    const taskIcon = <svg className="w-2 h-2 mr-3 text-gray-800 flex-shrink-0 mt-1.5" viewBox="0 0 16 16" fill="currentColor"><circle cx="8" cy="8" r="8"/></svg>;

    return tasks.map(task => {
        let commentsSectionHtml = null;

        // Chỉ hiển thị comment cho task cụ thể (không phải group)
        if (!task.is_group) {
            // Lọc comment: 
            // - Nếu có ownerEmail (báo cáo cá nhân), chỉ lấy comment của người đó.
            // - Nếu không (báo cáo tổng hợp), lấy tất cả comment.
            const relevantComments = ownerEmail 
                ? (task.comments || []).filter(c => c.comment_owner === ownerEmail)
                : (task.comments || []);
            
            if (relevantComments.length > 0) {
                commentsSectionHtml = relevantComments.map((comment, idx) => {
                    const commentDate = new Date(comment.comment_time).toLocaleString('vi-VN', {
                        day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
                    });
                    return (
                        <div key={idx} className="border-l-2 border-gray-200 pl-4">
                            <p className="text-xs text-gray-500">{comment.comment_owner} - {commentDate}</p>
                            <div className="mt-1 comment-content" dangerouslySetInnerHTML={{ __html: comment.comment_html }} />
                        </div>
                    );
                });
            } else {
                commentsSectionHtml = <p className="text-sm text-gray-500 italic">Chưa có báo cáo.</p>;
            }
        }

        return (
            <div key={task.task_id} className="mt-4" style={{ paddingLeft: `${level * 1.5}rem` }}>
                <div className="flex items-start">
                    {taskIcon}
                    <p className="text-sm font-semibold flex-grow">
                        {task.task_subject}
                        {!task.is_group ? <span className="font-normal text-gray-600"> ({task.task_status})</span> : ''}
                    </p>
                </div>
                <div className="pl-5 mt-2 space-y-4">
                    {commentsSectionHtml}
                </div>
                {/* Gọi đệ quy cho các task con */}
                <TaskTree tasks={task.children} level={level + 1} ownerEmail={ownerEmail} />
            </div>
        );
    });
}

// --- COMPONENT CHÍNH ĐỂ HIỂN THỊ BÁO CÁO ---
export default function DocumentReportView({ reportData }) {
    if (!reportData || reportData.length === 0) {
        return (
             <div className="report-paper text-center">
                <p className="text-gray-500">Không có dữ liệu phù hợp với bộ lọc.</p>
            </div>
        );
    }

    const today = new Date().toLocaleDateString('vi-VN', {
        day: '2-digit', month: '2-digit', year: 'numeric'
    });

    // **LOGIC SỬA LẠI:**
    // Kiểm tra xem đây có phải là báo cáo cá nhân không bằng cách xem project đầu tiên có trường `responsible_email` không.
    // Trường này chỉ được API thêm vào cho báo cáo cá nhân.
    const isPersonalReport = reportData[0] && reportData[0].responsible_email;

    if (isPersonalReport) {
        const owner = reportData[0].responsible_email;
        return (
            <div className="report-paper">
                <div className="border-b border-gray-300 pb-4 mb-4">
                    <h1 className="text-xl md:text-2xl font-bold text-gray-900">Báo cáo Công việc Cá nhân</h1>
                    <p className="text-sm text-gray-600 mt-1">Nhân viên: <span className="font-semibold">{owner}</span></p>
                    <p className="text-sm text-gray-500 mt-1">Ngày báo cáo: {today}</p>
                </div>
                {reportData.map(project => (
                    <div key={project.project_id} className="mt-6">
                        <h2 className="text-lg font-bold text-gray-800">{project.project_name}</h2>
                        <TaskTree tasks={project.tasks} ownerEmail={owner} />
                    </div>
                ))}
            </div>
        );
    }

    // Mặc định là báo cáo tổng hợp
    return (
        <div>
            {reportData.map(project => (
                <div key={project.project_id} className="report-paper">
                    <div className="border-b border-gray-300 pb-4 mb-2">
                        <h1 className="text-xl md:text-2xl font-bold text-gray-900">{project.project_name}</h1>
                        <p className="text-sm text-gray-500 mt-1">Báo cáo tiến độ tổng hợp - Ngày {today}</p>
                    </div>
                    <TaskTree tasks={project.tasks} />
                </div>
            ))}
        </div>
    );
}
