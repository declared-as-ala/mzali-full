// Backend-only contract (not mirrored from frontend types/).
// The Next BFF consumes these shapes when proxying /api/auth.

// 'employee' was merged into 'cashier' — the two roles had near-identical
// permissions (cashier now holds the union, see permissions.ts) and the
// admin UI only ever exposed a two-way admin/employee choice anyway (see
// EmployeesView.tsx, which still labels the 'cashier' role "Employé").
export type EmployeeRole =
  | 'super_admin'
  | 'admin'
  | 'order_manager'
  | 'catalog_manager'
  | 'viewer'
  | 'cashier'
  | 'store_manager';

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  role: EmployeeRole;
  mustChangePassword: boolean;
};

export type LoginResult = {
  accessToken: string;
  /** Opaque rotating refresh token. Stored only as a hash server-side. */
  refreshToken: string;
  /** Seconds until the access token expires. */
  expiresIn: number;
  user: AuthUser;
};

export type RefreshResult = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
};

/** Payload embedded in the HS256 access token (verified locally by the Next BFF). */
export type AccessTokenClaims = {
  sub: string;
  role: EmployeeRole;
  name: string;
};
