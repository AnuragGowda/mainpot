import type { Profile } from "@/lib/types";

export interface AvatarProps {
  profile?: Pick<Profile, "display_name" | "username" | "avatar_url"> | null;
  email?: string | null;
  size?: "sm" | "md" | "lg";
}

const sizes = {
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-16 w-16 text-xl",
};

function initials(profile: AvatarProps["profile"], email?: string | null) {
  const source = profile?.display_name || profile?.username || email || "A";
  const parts = source.trim().split(/\s+/).filter(Boolean);
  return parts.length > 1
    ? `${parts[0][0]}${parts[1][0]}`.toUpperCase()
    : source.slice(0, 2).toUpperCase();
}

export default function Avatar({ profile, email, size = "md" }: AvatarProps) {
  const classes = `${sizes[size]} shrink-0 rounded-full`;

  if (profile?.avatar_url) {
    return (
      // A user-controlled remote avatar does not need Next image optimization.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={profile.avatar_url}
        alt=""
        className={`${classes} object-cover ring-1 ring-black/5`}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className={`${classes} inline-flex items-center justify-center bg-gray-100 font-semibold text-gray-700 ring-1 ring-inset ring-gray-200`}
    >
      {initials(profile, email)}
    </span>
  );
}
