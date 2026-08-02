// Mirrored from the storefront's types/ directory — kept byte-identical,
// enforced by scripts/check-contracts.mjs in CI.
export * from './product';
export * from './category';
export * from './cart';
export * from './order';

// Backend-only additive contracts (consumed by the Next BFF / admin console).
export * from './auth';
export * from './employee';
export * from './coupon';
export * from './inventory';
export * from './location';
export * from './variant';
export * from './pos';
export * from './audit';
export * from './stats';
export * from './settings';
export * from './purchasing';
export * from './documents';
export * from './loyalty';
