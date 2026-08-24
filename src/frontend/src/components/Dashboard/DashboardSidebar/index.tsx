import { useNavigate } from 'react-router-dom';
import { Flex, FlexColumn } from '@Components/common/Layouts';
import { Button } from '@Components/RadixComponents/Button';
import { getLocalStorageValue } from '@Utils/getLocalStorageValue';
import hasErrorBoundary from '@Utils/hasErrorBoundary';
import avatarImage from '@Assets/images/avatar-images.svg';
import useSignedInRole from '@Hooks/useSignedInRole';
import { m } from '@/paraglide/messages';

const DashboardSidebar = () => {
  const navigate = useNavigate();
  const userDetails = getLocalStorageValue('userprofile');
  const [role] = useSignedInRole();
  return (
    <FlexColumn className="naxatw-h-full naxatw-items-center naxatw-rounded-xl naxatw-border naxatw-border-gray-500 naxatw-p-2.5 naxatw-py-4">
      <Flex className="naxatw-h-20 naxatw-w-20 naxatw-items-center naxatw-justify-center naxatw-overflow-hidden naxatw-rounded-full naxatw-bg-grey-600">
        <img
          // src="" never fires onError (the browser treats it as "no
          // image", not a failed load), so an empty profile_img would
          // otherwise render a permanent broken-image icon instead of the
          // fallback below.
          src={userDetails?.profile_img || avatarImage}
          alt={m.common_profile_picture_alt()}
          className="naxatw-h-full naxatw-w-full"
          onError={e => {
            e.currentTarget.onerror = null; // prevents looping
            e.currentTarget.src = avatarImage;
          }}
        />
      </Flex>
      <h5 className="mt-2.5">{userDetails?.name}</h5>
      <p className="naxatw-py-1 naxatw-text-body-sm">
        {role === 'PROJECT_CREATOR'
          ? m.dashboard_role_project_creator()
          : m.dashboard_role_drone_operator()}
      </p>
      <p className="naxatw-text-body-sm">{userDetails?.email_address}</p>

      <Button
        variant="outline"
        leftIcon="edit"
        className="naxatw-mt-8 naxatw-border-red !naxatw-text-red"
        onClick={() => navigate('/user-profile')}
      >
        {m.dashboard_sidebar_edit_profile()}
      </Button>
    </FlexColumn>
  );
};

export default hasErrorBoundary(DashboardSidebar);
