'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import DocumentReportView from '../../components/DocumentReportView';
import TableReportView from '../../components/TableReportView';

// Component con để xử lý logic, vì useSearchParams cần Suspense
function ReportDisplay() {
    const searchParams = useSearchParams();
    const [reportData, setReportData] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);

    const reportType = searchParams.get('reportType');

    useEffect(() => {
        const fetchData = async () => {
            setIsLoading(true);
            setError(null);
            
            // Lấy query string trực tiếp từ searchParams
            const queryParams = searchParams.toString();

            try {
                const response = await fetch(`/api/report?${queryParams}`);
                if (!response.ok) {
                    const errData = await response.json();
                    throw new Error(errData.error || 'Lỗi khi lấy dữ liệu từ server');
                }
                const data = await response.json();
                setReportData(data);
            } catch (err) {
                setError(err.message);
            } finally {
                setIsLoading(false);
            }
        };

        fetchData();
    }, [searchParams]); // Chạy lại mỗi khi URL thay đổi

    if (isLoading) {
        return <div className="text-center p-10">Đang tải dữ liệu báo cáo...</div>;
    }

    if (error) {
        return <div className="report-paper text-red-500 text-center"><p>{error}</p></div>;
    }

    if (reportType === 'document') {
        return <DocumentReportView reportData={reportData} />;
    }

    if (reportType === 'table') {
        return <TableReportView reportData={reportData} />;
    }

    return <div className="report-paper text-center"><p>Loại báo cáo không hợp lệ.</p></div>;
}


// Component trang chính, bọc ReportDisplay trong Suspense
export default function ReportPage() {
    return (
        <main className="p-4 sm:p-8">
            <Suspense fallback={<div className="text-center p-10">Đang tải trang...</div>}>
                <ReportDisplay />
            </Suspense>
        </main>
    );
}
