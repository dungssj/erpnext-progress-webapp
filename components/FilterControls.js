'use client';
import { useState, useEffect } from 'react';

export default function FilterControls({ reportType, onGenerate, isLoading }) {
  const [reportSubType, setReportSubType] = useState('tong_hop'); // 'tong_hop' | 'ca_nhan'
  const [filters, setFilters] = useState({
    from_date: '',
    to_date: '',
    company: '',
    project: '',
    comment_owner: '',
    project_status: [], // <-- Thêm state cho trạng thái dự án
  });

  // State để lưu danh sách lấy từ API
  const [companies, setCompanies] = useState([]);
  const [projects, setProjects] = useState([]);
  const [projectsLoading, setProjectsLoading] = useState(false);

  // Lấy danh sách công ty khi component được tải
  useEffect(() => {
    const fetchCompanies = async () => {
      try {
        const res = await fetch('/api/companies');
        const data = await res.json();
        setCompanies(data);
      } catch (error) {
        console.error("Lỗi khi tải danh sách công ty:", error);
      }
    };
    fetchCompanies();
  }, []);

  // Lấy danh sách dự án khi công ty thay đổi
  useEffect(() => {
    const fetchProjects = async () => {
      if (!filters.company) {
        setProjects([]);
        setFilters(f => ({ ...f, project: '' }));
        return;
      }
      setProjectsLoading(true);
      try {
        const res = await fetch(`/api/projects?company=${encodeURIComponent(filters.company)}`);
        const data = await res.json();
        setProjects(data);
      } catch (error) {
        console.error("Lỗi khi tải danh sách dự án:", error);
      } finally {
        setProjectsLoading(false);
      }
    };
    fetchProjects();
  }, [filters.company]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFilters(prev => ({ ...prev, [name]: value }));
  };

  // Hàm mới để xử lý checkbox trạng thái
  const handleStatusChange = (e) => {
    const { value, checked } = e.target;
    setFilters(prev => {
      const currentStatuses = prev.project_status;
      if (checked) {
        return { ...prev, project_status: [...currentStatuses, value] };
      } else {
        return { ...prev, project_status: currentStatuses.filter(status => status !== value) };
      }
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    let activeFilters = { ...filters, reportSubType };

    // Chuyển mảng trạng thái thành chuỗi để gửi đi
    if (activeFilters.project_status && activeFilters.project_status.length > 0) {
        activeFilters.project_status = activeFilters.project_status.join(',');
    } else {
        delete activeFilters.project_status;
    }

    if (reportType === 'document') {
        if (reportSubType === 'tong_hop') {
            delete activeFilters.comment_owner;
        } else { // ca_nhan
            delete activeFilters.company;
            delete activeFilters.project;
        }
    }
    
    activeFilters = Object.fromEntries(
      Object.entries(activeFilters).filter(([_, v]) => v != null && v !== '')
    );
    onGenerate(activeFilters);
  };
  
  const isDocumentReport = reportType === 'document';

  return (
    <div className="bg-white p-6 rounded-lg shadow-md border no-print">
      <form onSubmit={handleSubmit}>
        {isDocumentReport && (
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">Loại báo cáo Document</label>
            <div className="flex space-x-4">
              <button type="button" onClick={() => setReportSubType('tong_hop')} className={`px-4 py-2 text-sm rounded ${reportSubType === 'tong_hop' ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-200'}`}>Toàn bộ dự án</button>
              <button type="button" onClick={() => setReportSubType('ca_nhan')} className={`px-4 py-2 text-sm rounded ${reportSubType === 'ca_nhan' ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-200'}`}>Theo cá nhân</button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
          <div>
            <label htmlFor="from_date" className="block text-sm font-medium text-gray-700">Từ ngày</label>
            <input type="date" name="from_date" id="from_date" value={filters.from_date} onChange={handleInputChange} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm" />
          </div>
          <div>
            <label htmlFor="to_date" className="block text-sm font-medium text-gray-700">Đến ngày</label>
            <input type="date" name="to_date" id="to_date" value={filters.to_date} onChange={handleInputChange} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm" />
          </div>
          
          {/* --- BỘ LỌC TRẠNG THÁI DỰ ÁN MỚI --- */}
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700">Trạng thái Dự án</label>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
                {['open', 'completed', 'cancelled'].map(status => (
                    <div key={status} className="flex items-center">
                        <input
                            id={`status-${status}`}
                            name="project_status"
                            type="checkbox"
                            value={status}
                            checked={filters.project_status.includes(status)}
                            onChange={handleStatusChange}
                            className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        <label htmlFor={`status-${status}`} className="ml-2 block text-sm text-gray-900">{status}</label>
                    </div>
                ))}
            </div>
          </div>

          {(reportSubType === 'ca_nhan' || reportType === 'table') && (
             <div>
              <label htmlFor="comment_owner" className="block text-sm font-medium text-gray-700">Email cá nhân</label>
              <input type="email" name="comment_owner" id="comment_owner" value={filters.comment_owner} onChange={handleInputChange} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm" placeholder="vi.du@f.com" />
            </div>
          )}

          {(reportSubType === 'tong_hop' || reportType === 'table') && (
            <>
              <div>
                <label htmlFor="company" className="block text-sm font-medium text-gray-700">Công ty</label>
                <select id="company" name="company" value={filters.company} onChange={handleInputChange} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm">
                  <option value="">Tất cả công ty</option>
                  {companies.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="project" className="block text-sm font-medium text-gray-700">Dự án</label>
                <select id="project" name="project" value={filters.project} onChange={handleInputChange} disabled={!filters.company || projectsLoading} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm disabled:bg-gray-100">
                  <option value="">Tất cả dự án</option>
                  {projects.map(p => <option key={p.name} value={p.name}>{p.project_name}</option>)}
                </select>
              </div>
            </>
          )}
        </div>

        <div className="mt-6 text-right">
          <button type="submit" disabled={isLoading} className="bg-blue-600 text-white font-bold py-2 px-5 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 transition-colors">
            {isLoading ? 'Đang xử lý...' : 'Xuất Báo Cáo'}
          </button>
        </div>
      </form>
    </div>
  );
}
