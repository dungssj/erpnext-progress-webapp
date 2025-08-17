import { FrappeApp } from 'frappe-js-sdk';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const app = new FrappeApp(process.env.FRAPPE_URL, {
      useToken: true,
      token: () => `${process.env.FRAPPE_API_KEY}:${process.env.FRAPPE_API_SECRET}`,
      type: 'token'
    });
    const db = app.db();

    const companiesData = await db.getDocList('Project', {
      fields: ['company'],
      limit: 10000
    });

    // Lọc ra các tên công ty duy nhất và không rỗng
    const uniqueCompanies = [...new Set(companiesData.map(p => p.company).filter(Boolean))];

    return NextResponse.json(uniqueCompanies);
  } catch (error) {
    console.error('Lỗi API (companies):', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
