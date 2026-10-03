export const GITHUB_URL = "https://github.com/AnuragGowda/mainpot";
export const BUG_REPORT_URL = `${GITHUB_URL}/issues/new?template=bug_report.yml`;
export const FEATURE_REQUEST_URL = `${GITHUB_URL}/issues/new?template=feature_request.yml`;
export const SUPPORT_EMAIL =
  process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim() || "support@mainpot.app";

// A creator's support page is optional. Invalid configuration should hide the
// link rather than break public pages or create an unsafe navigation target.
export const SUPPORT_URL = (() => {
  const configured = process.env.NEXT_PUBLIC_SUPPORT_URL?.trim();
  if (!configured) return null;
  try {
    const url = new URL(configured);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
})();
