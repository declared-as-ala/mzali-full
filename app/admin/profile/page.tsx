import { getPasswordMeta } from '@/lib/admin-storage';
import { getValidAccessToken } from '@/lib/api-auth';
import { apiRequest } from '@/services/mzali-api/client';
import ProfileView from '@/components/admin/ProfileView';

export const dynamic = 'force-dynamic';

const PROVIDER = process.env.COMMERCE_PROVIDER ?? 'woocommerce';

async function loadMzaliApiProfile() {
  const bearer = await getValidAccessToken();
  if (!bearer) return null;
  return apiRequest<{ email: string; mustChangePassword: boolean }>('/auth/me', { bearer }).catch(() => null);
}

export default async function ProfilePage() {
  if (PROVIDER === 'mzali-api') {
    const me = await loadMzaliApiProfile();
    if (me) {
      return (
        <ProfileView
          username={me.email}
          hasCustomPassword
          passwordUpdatedAt={null}
          envFallbackEnabled={false}
          mustChangePassword={me.mustChangePassword}
        />
      );
    }
  }

  const meta = await getPasswordMeta();
  return (
    <ProfileView
      username="admin"
      hasCustomPassword={meta.hasCustom}
      passwordUpdatedAt={meta.updatedAt}
      envFallbackEnabled={Boolean(process.env.ADMIN_PASSWORD)}
      mustChangePassword={false}
    />
  );
}
