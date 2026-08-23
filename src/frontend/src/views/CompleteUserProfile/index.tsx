import { useTypedDispatch, useTypedSelector } from '@Store/hooks';
import { useNavigate } from 'react-router-dom';
import { FieldValues, useForm, UseFormReturn } from 'react-hook-form';
import { AxiosError, AxiosResponse } from 'axios';
import {
  BasicDetails,
  OrganizationDetails,
  OtherDetails,
  PasswordSection,
} from '@Components/CompleteUserProfile/FormContents';
import {
  tabOptions,
  projectCreatorKeys,
  droneOperatorKeys,
} from '@Constants/index';
import { setCommonState } from '@Store/actions/common';
import { Button } from '@Components/RadixComponents/Button';
import Image from '@Components/RadixComponents/Image';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { patchUserProfile, postUserProfile } from '@Services/common';
import { toast } from 'react-toastify';
import { removeKeysFromObject } from '@Utils/index';
import { getLocalStorageValue } from '@Utils/getLocalStorageValue';
import Tab from '@Components/common/Tabs';
import hasErrorBoundary from '@Utils/hasErrorBoundary';
import useWindowDimensions from '@Hooks/useWindowDimensions';
import { useGetUserDetailsQuery } from '@Api/projects';
import callApiSimultaneously from '@Utils/callApiSimultaneously';
import dtmLogo from '@Assets/images/drone-tasking-manager.svg';
import { getRuntimeConfig } from '@/runtimeConfig';
import { m } from '@/paraglide/messages';

const AUTH_PROVIDER = getRuntimeConfig('VITE_AUTH_PROVIDER', 'legacy');
const isHankoAuth = AUTH_PROVIDER === 'hanko';

// Filter out Password tab when using Hanko auth (password managed by Hanko)
const filteredTabOptions = isHankoAuth
  ? tabOptions.filter(tab => tab.id !== 3)
  : tabOptions;

type ProfileFormData = {
  name?: string;
  country: string | null;
  city: string | null;
  password: string | null;
  confirm_password: string | null;
  phone_number: string | null;
  organization_name: string | null;
  organization_address: string | null;
  job_title: string | null;
  notify_for_projects_within_km: number | null;
  experience_years: number | null;
  certified_drone_operator: boolean;
  certificate_file: unknown;
  registration_file: unknown;
  drone_you_own: string | null;
  role: number[];
};

type CompleteProfileFormProps = Pick<
  UseFormReturn<FieldValues>,
  'register' | 'setValue' | 'formState' | 'control' | 'watch'
>;

const getActiveFormContent = (
  activeTab: number,
  userType: string,
  formProps: CompleteProfileFormProps,
) => {
  switch (activeTab) {
    case 1:
      return <BasicDetails formProps={formProps} />;
    case 2:
      return userType === 'PROJECT_CREATOR' ? (
        <OrganizationDetails formProps={formProps} />
      ) : (
        <OtherDetails formProps={formProps} />
      );
    case 3:
      return <PasswordSection formProps={formProps} />;
    default:
      return <></>;
  }
};

const CompleteUserProfile = () => {
  const dispatch = useTypedDispatch();
  const navigate = useNavigate();
  const { width } = useWindowDimensions();
  const queryClient = useQueryClient();
  const signedInAs = localStorage.getItem('signedInAs') || 'PROJECT_CREATOR';
  const isDroneOperator = localStorage.getItem('signedInAs') === 'DRONE_PILOT';
  useGetUserDetailsQuery();
  const userProfileActiveTab = useTypedSelector(
    state => state.common.userProfileActiveTab,
  );
  const userProfile = getLocalStorageValue('userprofile');
  const existingRole = userProfile?.role?.[0] === 'PROJECT_CREATOR' ? 1 : 2;
  const newRole = isDroneOperator ? 2 : 1;
  // An existing account with a role already set, landing here only because
  // the picked sign-in role doesn't match it yet - as opposed to a brand
  // new account with no profile at all, mid first-time setup.
  const isRoleMismatch = !!userProfile?.role?.length;
  const missingRoleLabel = isDroneOperator
    ? m.auth_role_drone_operator()
    : m.auth_role_project_creator();

  const initialState: ProfileFormData = {
    name: userProfile?.name,
    country: userProfile?.country || null,
    city: userProfile?.city || null,
    password: null,
    confirm_password: null,
    // country_code: userProfile?.country_code || null,
    phone_number: userProfile?.phone_number || null,
    // for project creators
    organization_name: userProfile?.organization_name || null,
    organization_address: userProfile?.organization_address || null,
    job_title: userProfile?.job_title || null,
    // for drone operators
    notify_for_projects_within_km: null,
    experience_years: null,
    certified_drone_operator: false,
    certificate_file: null,
    registration_file: null,
    drone_you_own: null,
    role: userProfile?.role ? [existingRole, newRole] : [newRole],
  };

  const {
    register,
    setValue,
    handleSubmit,
    formState,
    control,
    watch,
    getValues,
  } = useForm({
    defaultValues: initialState,
  });

  const formProps = {
    register,
    setValue,
    formState,
    control,
    watch,
  };

  const { mutate: updateUserProfile } = useMutation<
    AxiosResponse,
    AxiosError,
    { userId: number; data: Record<string, unknown> },
    unknown
  >({
    mutationFn: payloadDataObject => {
      const role = payloadDataObject?.data?.role;
      return Array.isArray(role) && role.length === 1
        ? postUserProfile(payloadDataObject)
        : patchUserProfile(payloadDataObject);
    },
    onSuccess: async response => {
      const results = (response.data as { results?: Record<string, unknown> })
        ?.results;
      const values = getValues() as Record<string, unknown>;
      const certificateFile = values?.certificate_file as
        | { file?: unknown }[]
        | undefined;
      const registrationFile = values?.registration_file as
        | { file?: unknown }[]
        | undefined;
      const urlsToUpload: string[] = [];
      const assetsToUpload: unknown[] = [];
      if (results?.certificate_url) {
        urlsToUpload.push(results.certificate_url as string);
        assetsToUpload.push(certificateFile?.[0]?.file);
      }
      if (results?.registration_certificate_url) {
        urlsToUpload.push(results.registration_certificate_url as string);
        assetsToUpload.push(registrationFile?.[0]?.file);
      }
      if (urlsToUpload.length) {
        await callApiSimultaneously(urlsToUpload, assetsToUpload, 'put');
      }

      void queryClient.invalidateQueries({ queryKey: ['user-profile'] });
      dispatch(setCommonState({ userProfileActiveTab: 1 }));
      toast.success(m.profile_update_success());
      void navigate('/projects');
    },
    onError: err => {
      // eslint-disable-next-line no-console
      console.log(err);
    },
  });

  // With Hanko auth, skip the password tab (tab 3)
  // New users: tabs 1, 2, (skip 3 if Hanko) → submit
  // Existing users adding role: tabs 1, 2 → submit
  const lastTab = isHankoAuth ? 2 : 3;

  const onSubmit = (formData: ProfileFormData) => {
    if (userProfile?.role) {
      if (userProfileActiveTab !== 2) {
        dispatch(
          setCommonState({ userProfileActiveTab: userProfileActiveTab + 1 }),
        );
        return;
      }
    }

    if (!userProfile?.role?.length) {
      if (userProfileActiveTab !== lastTab) {
        dispatch(
          setCommonState({ userProfileActiveTab: userProfileActiveTab + 1 }),
        );
        return;
      }
    }

    const finalFormData = isDroneOperator
      ? removeKeysFromObject(formData, projectCreatorKeys)
      : removeKeysFromObject(formData, droneOperatorKeys);

    const certificateFile = formData?.certificate_file as
      | { file?: { name?: string } }[]
      | undefined;
    const registrationFile = formData?.registration_file as
      | { file?: { name?: string } }[]
      | undefined;
    updateUserProfile({
      userId: userProfile?.id,
      data: {
        ...finalFormData,
        // post file name with data
        certificate_file: certificateFile?.[0]?.file?.name,
        registration_file: registrationFile?.[0]?.file?.name,
      },
    });
  };

  const onBackBtnClick = () => {
    if (userProfileActiveTab === 1) return;
    dispatch(
      setCommonState({ userProfileActiveTab: userProfileActiveTab - 1 }),
    );
  };

  return (
    <section className="naxatw-h-screen md:naxatw-pt-[5%]">
      {isRoleMismatch && (
        <div className="naxatw-mx-auto naxatw-mb-2 naxatw-flex naxatw-w-full naxatw-max-w-[34rem] naxatw-items-center naxatw-justify-between naxatw-px-1">
          <a
            className="naxatw-flex naxatw-items-center naxatw-gap-2 hover:naxatw-no-underline"
            href="/projects"
          >
            <Image
              src={dtmLogo}
              alt={m.common_dtm_logo_alt()}
              className="naxatw-h-6 naxatw-w-6"
            />
            <span className="naxatw-text-hot-gray-950 naxatw-text-sm naxatw-font-bold">
              Drone Tasking Manager
            </span>
          </a>
          <a
            className="naxatw-text-sm naxatw-text-red hover:naxatw-underline"
            href="/projects"
          >
            {m.auth_back()}
          </a>
        </div>
      )}
      {isRoleMismatch && (
        <p className="naxatw-mx-auto naxatw-mb-2 naxatw-w-full naxatw-max-w-[34rem] naxatw-rounded-md naxatw-bg-yellow-50 naxatw-p-3 naxatw-text-sm naxatw-text-grey-800">
          {m.complete_profile_role_mismatch_banner({
            role: missingRoleLabel,
          })}
        </p>
      )}
      <div className="naxatw-mx-auto naxatw-flex naxatw-h-[80vh] naxatw-w-full naxatw-flex-col naxatw-gap-2 naxatw-border naxatw-shadow-lg md:naxatw-w-[34rem] md:naxatw-flex-row">
        <div className="naxatw-w-full naxatw-border-r md:naxatw-w-2/6">
          <Tab
            className="naxatw-w-full naxatw-border-b"
            orientation={width < 768 ? 'row' : 'column'}
            onTabChange={() => {}}
            tabOptions={filteredTabOptions}
            activeTab={userProfileActiveTab}
          />
        </div>
        <div className="naxatw-flex naxatw-flex-[70%] naxatw-flex-col naxatw-justify-between naxatw-py-1">
          <div className="naxatw-h-[calc(80vh-7rem)] naxatw-overflow-y-scroll md:naxatw-h-[calc(80vh-5rem)]">
            {getActiveFormContent(
              userProfileActiveTab,
              signedInAs,
              formProps as unknown as CompleteProfileFormProps,
            )}
          </div>
          <div className="naxatw-flex naxatw-h-[50px] naxatw-justify-between naxatw-px-12 naxatw-py-1">
            <Button
              className="naxatw-text-red"
              variant="ghost"
              onClick={onBackBtnClick}
              leftIcon="chevron_left"
            >
              {m.auth_back()}
            </Button>
            <Button
              className="naxatw-bg-red"
              onClick={e => {
                e.preventDefault();
                void handleSubmit(onSubmit)();
              }}
              withLoader
            >
              {userProfileActiveTab === lastTab
                ? m.profile_complete_profile()
                : m.profile_next()}
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
};

export default hasErrorBoundary(CompleteUserProfile);
