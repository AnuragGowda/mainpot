export const GITHUB_URL = "https://github.com/AnuragGowda/mainpot";
export const BUG_REPORT_URL = `${GITHUB_URL}/issues/new?template=bug_report.yml`;
export const FEATURE_REQUEST_URL = `${GITHUB_URL}/issues/new?template=feature_request.yml`;
export const SUPPORT_EMAIL =
  process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim() || "support@mainpot.app";
