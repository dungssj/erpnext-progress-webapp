import React from 'react';

// --- HÀM HỖ TRỢ PARSE HTML ---
/**
 * Tách nội dung HTML từ comment thành các phần riêng biệt.
 * @param {string} html - Chuỗi HTML từ comment.
 * @returns {object} - Object chứa 'ket_qua' và 'ke_hoach'.
 */
const parseCommentHtml = (html) => {
    if (!html) {
        return { ket_qua: '<p class="text-gray-500 italic">Không có nội dung.</p>', ke_hoach: '' };
    }

    const parser = new DOMParser();
    const doc = parser.parseFromString(`<div>${html}</div>`, 'text/html');
    const root = doc.body.firstChild;

    let ketQuaParts = [];
    let keHoachParts = [];

    const headings = {
        'kế hoạch tiếp theo': keHoachParts,
        'giải pháp đề xuất': keHoachParts,
        'vấn đề': keHoachParts,
        'nội dung chi tiết': ketQuaParts,
        'tiến độ': ketQuaParts,
        'hoàn thành': ketQuaParts,
        'tham chiếu': ketQuaParts,
    };

    let currentSection = ketQuaParts; // Mặc định là kết quả

    root.childNodes.forEach(node => {
        if (node.nodeType === Node.ELEMENT_NODE) {
            const textContent = node.textContent.toLowerCase().trim();
            let matched = false;
            for (const key in headings) {
                if (textContent.includes(`[${key}]`) || textContent.startsWith(key + ':')) {
                    currentSection = headings[key];
                    matched = true;
                    // Chỉ thêm phần sau dấu hai chấm nếu có, hoặc toàn bộ nếu là tag [TIẾN ĐỘ]
                    const cleanHtml = node.innerHTML.replace(/<strong>\[.*?\]:<\/strong>/i, '').trim();
                    if(cleanHtml) currentSection.push(cleanHtml);
                    break;
                }
            }
             if (!matched) {
                // Nếu không khớp heading nào, mặc định đưa vào phần hiện tại
                 currentSection.push(node.outerHTML);
            }
        }
    });
    
    // Nếu không có gì được thêm vào ketQuaParts, lấy toàn bộ nội dung
    if (ketQuaParts.length === 0 && keHoachParts.length === 0) {
       ketQuaParts.push(html);
    }


    return {
        ket_qua: ketQuaParts.join('<br>') || '<p class="text-gray-500 italic">Không có.</p>',
        ke_hoach: keHoachParts.join('<br>') || '<p class="text-gray-500 italic">Không có.</p>',
    };
};


// --- HÀM CHÍNH ---
// Hàm làm phẳng dữ liệu cây thành danh sách các hàng cho bảng
const flattenDataForTable = (projects) => {
    const rows = [];

    const traverseTasks = (tasks, project, parentTaskSubject = '') => {
        if (!tasks) return;
        tasks.forEach(task => {
            // Không hiển thị các task group là một hàng riêng, chỉ xử lý children của chúng
            if (task.is_group) {
                 if (task.children && task.children.length > 0) {
                    traverseTasks(task.children, project, task.task_subject);
                }
                return; // Bỏ qua task group
            }

            // Nếu task không có comment, vẫn hiển thị một hàng trống
            if (!task.comments || task.comments.length === 0) {
                rows.push({
                    ten_cv: task.task_subject,
                    ket_qua: '<p class="text-gray-500 italic">Chưa có báo cáo.</p>',
                    ke_hoach: '',
                    thoi_gian: 'N/A',
                    nguoi_thuc_hien: 'N/A',
                });
            } else {
                // Nếu có comment, tạo hàng cho mỗi comment
                task.comments.forEach(comment => {
                    const parsedContent = parseCommentHtml(comment.comment_html);
                    rows.push({
                        ten_cv: task.task_subject,
                        ket_qua: parsedContent.ket_qua,
                        ke_hoach: parsedContent.ke_hoach,
                        thoi_gian: new Date(comment.comment_time).toLocaleString('vi-VN'),
                        nguoi_thuc_hien: comment.comment_owner,
                    });
                });
            }
        });
    };

    projects.forEach(project => {
        // Thêm một hàng cho tên dự án
        rows.push({ isProjectHeader: true, projectName: project.project_name });
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
                        <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-12">STT</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tên CV</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Kết quả đã đạt</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Kế hoạch tiếp theo</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Thời gian đã thực hiện</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Người thực hiện</th>
                    </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                    {(() => {
                        let stt = 0;
                        return tableRows.map((row, index) => {
                            if (row.isProjectHeader) {
                                stt = 0; // Reset STT cho mỗi dự án mới
                                return (
                                    <tr key={`proj-${index}`}>
                                        <td colSpan="6" className="px-6 py-3 bg-blue-50 text-blue-800 font-bold text-sm">
                                            Dự án: {row.projectName}
                                        </td>
                                    </tr>
                                );
                            }
                            stt++;
                            return (
                                <tr key={index}>
                                     <td className="px-4 py-4 whitespace-nowrap text-sm text-center text-gray-500">{stt}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{row.ten_cv}</td>
                                    <td className="px-6 py-4 text-sm text-gray-600">
                                        <div className="comment-content" dangerouslySetInnerHTML={{ __html: row.ket_qua }} />
                                    </td>
                                    <td className="px-6 py-4 text-sm text-gray-600">
                                        <div className="comment-content" dangerouslySetInnerHTML={{ __html: row.ke_hoach }} />
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{row.thoi_gian}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{row.nguoi_thuc_hien}</td>
                                </tr>
                            );
                        })
                    })()}
                </tbody>
            </table>
        </div>
    );
}