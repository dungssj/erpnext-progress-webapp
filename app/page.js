'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation'; // Import useRouter
import FilterControls from '../components/FilterControls';

export default function DashboardPage() {
  const [reportType, setReportType] = useState('document'); // Mặc định chọn 'document'
  const router = useRouter(); // Khởi tạo router

  // Hàm này giờ sẽ điều hướng thay vì fetch data
  const handleGenerateReport = (filters) => {
    // Thêm loại báo cáo vào bộ lọc để trang report biết cần hiển thị gì
    const params = { ...filters, reportType };
    
    // Xây dựng query string từ object filters
    const queryParams = new URLSearchParams(params).toString();
    
    // Điều hướng đến trang report với các tham số
    router.push(`/report?${queryParams}`);
  };

  return (
    <main className="p-4 sm:p-8">
      <div className="max-w-7xl mx-auto">
        <header className="text-center border-b pb-6 mb-6">
          <h1 className="text-4xl font-bold text-gray-800">Dashboard Báo Cáo</h1>
          <p className="text-gray-600 mt-2">Chọn loại báo cáo và áp dụng bộ lọc để xem kết quả.</p>
        </header>

        {/* Khu vực chọn loại báo cáo */}
        <div className="flex justify-center space-x-4 mb-8">
          <button
            onClick={() => setReportType('document')}
            className={`px-6 py-3 font-semibold rounded-lg transition ${reportType === 'document' ? 'bg-blue-600 text-white shadow-lg' : 'bg-white text-gray-700 hover:bg-gray-100'}`}
          >
            Báo cáo Document
          </button>
          <button
            onClick={() => setReportType('table')}
            className={`px-6 py-3 font-semibold rounded-lg transition ${reportType === 'table' ? 'bg-blue-600 text-white shadow-lg' : 'bg-white text-gray-700 hover:bg-gray-100'}`}
          >
            Báo cáo Bảng
          </button>
        </div>

        {/* Component bộ lọc giờ sẽ kích hoạt việc điều hướng */}
        <FilterControls
          reportType={reportType}
          onGenerate={handleGenerateReport}
          // Không cần isLoading ở đây nữa
        />
      </div>
    </main>
  );
}
