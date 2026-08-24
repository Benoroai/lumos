import type {
  AccountStatus as DbAccountStatus,
  BusinessType as DbBusinessType,
  SubscriptionStatus as DbSubscriptionStatus,
  TranslationStatus as DbTranslationStatus,
  DiscountType as DbDiscountType,
  AnalyticsEventType as DbAnalyticsEventType,
  MembershipStatus as DbMembershipStatus,
  ModifierSelection as DbModifierSelection,
  MediaKind as DbMediaKind,
} from "./database.generated";

export type AccountStatus = DbAccountStatus;
export type BusinessType = DbBusinessType;
export type SubscriptionStatus = DbSubscriptionStatus;
export type TranslationStatus = DbTranslationStatus;
export type DiscountType = DbDiscountType;
export type AnalyticsEventType = DbAnalyticsEventType;
export type MembershipStatus = DbMembershipStatus;
export type ModifierSelection = DbModifierSelection;
export type MediaKind = DbMediaKind;

export type PlatformRoleRow = {
  code: string;
  name: string;
  is_owner_role: boolean;
};

/** Result shape returned by every server action. */
export type ActionResult<T = void> =
  | { ok: true; data: T; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

export function actionOk<T>(data: T, message?: string): ActionResult<T> {
  return message === undefined
    ? { ok: true, data }
    : { ok: true, data, message };
}

export function actionError(
  error: string,
  fieldErrors?: Record<string, string[]>,
): ActionResult<never> {
  return fieldErrors ? { ok: false, error, fieldErrors } : { ok: false, error };
}

export type Paginated<T> = {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
};

export type LocalizedText = Record<string, string>;
