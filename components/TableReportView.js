import React from 'react';

// Hàm làm phẳng dữ liệu cây thành danh sách các hàng cho bảng
const flattenDataForTable = (projects) => {
    const rows = [];

    const traverseTasks = (tasks, project, parentTaskSubject = '') => {
        if (!tasks) return;
        tasks.forEach(task => {
            const currentTaskPath = parentTaskSubject ? `${parentTaskSubject} -> ${task.task_subject}` : task.task_subject;

            if (task.comments && task.comments.length > 0) {
                task.comments.forEach(comment => {
                    rows.push({
                        project_name: project.project_name,
                        task_path: currentTaskPath,
                        comment_html: comment.comment_html,
                        comment_owner: comment.comment_owner,
                        comment_time: new Date(comment.comment_time).toLocaleString('vi-VN'),
                    });
                });
            } else if (!task.is_group) {
                // Thêm cả những task không có comment
                rows.push({
                    project_name: project.project_name,
                    task_path: currentTaskPath,
                    comment_html: '<p class="text-gray-500 italic">Chưa có báo cáo.</p>',
                    comment_owner: 'N/A',
                    comment_time: 'N/A',
                });
            }

            if (task.children && task.children.length > 0) {
                traverseTasks(task.children, project, currentTaskPath);
            }
        });
    };

    projects.forEach(project => {
        traverseTasks(project.tasks, project);
    });

    return rows;
};

export default function TableReportView({ reportData }) {
    if (!reportData || reportData.length === 0) {
        return (
             <div className="report-paper text-center">
                <p className="text-gray-500">Không có dữ liệu phù hợp với bộ lọc.</p>
            </div>
        );
    }

    const tableRows = flattenDataForTable(reportData);

    return (
        <div className="bg-white p-4 sm:p-6 rounded-lg shadow-md border overflow-x-auto">
            <h2 className="text-xl font-bold mb-4">Báo cáo dạng Bảng</h2>
            <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                    <tr>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Dự án</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Công việc</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nội dung báo cáo</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Người báo cáo</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Thời gian</th>
                    </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                    {tableRows.map((row, index) => (
                        <tr key={index}>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{row.project_name}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{row.task_path}</td>
                            <td className="px-6 py-4 text-sm text-gray-500">
                                <div className="comment-content" dangerouslySetInnerHTML={{ __html: row.comment_html }} />
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{row.comment_owner}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{row.comment_time}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
