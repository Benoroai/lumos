import { getRequestConfig } from "next-intl/server";
import { cookies } from "next/headers";
import { DEFAULT_LOCALE, LOCALE_COOKIE, isDashboardLocale } from "./config";

/**
 * The dashboard has no locale URL segment: the language follows the signed-in
 * user, stored in a cookie. That keeps deep links stable when a user switches
 * language and avoids duplicating every admin route per locale.
 */
export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const requested = cookieStore.get(LOCALE_COOKIE)?.value;
  const locale = isDashboardLocale(requested) ? requested : DEFAULT_LOCALE;

  return {
    locale,
    messages: (await import(`@/messages/${locale}.json`)).default,
    timeZone: "Asia/Muscat",
    now: new Date(),
  };
});
