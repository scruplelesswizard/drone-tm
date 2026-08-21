import avatarImage from '@Assets/images/avatar-images.svg';

interface IUserAvatarProps {
  className?: string;
  imageSource?: string;
}

export default function UserAvatar({
  className,
  imageSource,
}: IUserAvatarProps) {
  return (
    <div
      className={`naxatw-flex naxatw-h-8 naxatw-w-8 naxatw-items-center naxatw-justify-center naxatw-rounded-full naxatw-bg-red naxatw-text-body-md naxatw-font-semibold naxatw-capitalize naxatw-text-white ${className}`}
    >
      <img
        // An empty string src (a user with no profile_img, e.g. legacy-auth
        // signup) never fires onError - the HTML/React img element treats
        // src="" as "no image" rather than a failed load, so the broken-
        // image icon + alt text render permanently instead of falling back.
        // Only ever set src to a real URL; fall straight to the SVG
        // otherwise.
        src={imageSource || avatarImage}
        alt="profile"
        className="naxatw-h-full naxatw-w-full"
        onError={e => {
          e.currentTarget.onerror = null; // prevents looping
          e.currentTarget.src = avatarImage;
        }}
      />
    </div>
  );
}
