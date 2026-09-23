import PointageEmployeeProfileView from '@/components/admin/PointageEmployeeProfileView';

export const dynamic = 'force-dynamic';

export default async function PointageEmployeeProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PointageEmployeeProfileView employeeId={id} />;
}
