import { FrappeApp } from 'frappe-js-sdk';
import { NextResponse } from 'next/server';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const company = searchParams.get('company');

    const app = new FrappeApp(process.env.FRAPPE_URL, {
      useToken: true,
      token: () => `${process.env.FRAPPE_API_KEY}:${process.env.FRAPPE_API_SECRET}`,
      type: 'token'
    });
    const db = app.db();

    const filters = {};
    if (company) {
      filters.company = company;
    }

    const projectsData = await db.getDocList('Project', {
      fields: ['name', 'project_name'],
      filters: filters,
      limit: 10000
    });

    return NextResponse.json(projectsData);
  } catch (error) {
    console.error('Lỗi API (projects):', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
