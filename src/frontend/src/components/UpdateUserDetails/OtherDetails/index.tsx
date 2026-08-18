import { Controller, useForm } from 'react-hook-form';
import { AxiosError, AxiosResponse } from 'axios';
import { getLocalStorageValue } from '@Utils/getLocalStorageValue';
import { Flex, FlexColumn } from '@Components/common/Layouts';
import { FormControl, Input, Label } from '@Components/common/FormUI';
import ErrorMessage from '@Components/common/ErrorMessage';
import RadioButton from '@Components/common/RadioButton';
import FileUpload from '@Components/common/UploadArea';
import { droneOperatorOptions } from '@Constants/index';
import { useTypedDispatch, useTypedSelector } from '@Store/hooks';
import { setCommonState } from '@Store/actions/common';
import { Button } from '@Components/RadixComponents/Button';
import { patchUserProfile } from '@Services/common';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-toastify';
import callApiSimultaneously from '@Utils/callApiSimultaneously';
import { useEffect } from 'react';
import { m } from '@/paraglide/messages';

type OtherDetailsFormData = {
  notify_for_projects_within_km: number | null;
  experience_years: number | null;
  certified_drone_operator: boolean;
  drone_you_own: string | null;
  certificate_file: unknown;
  registration_file: unknown;
};

const OtherDetails = () => {
  const userProfile = getLocalStorageValue('userprofile');
  const dispatch = useTypedDispatch();
  const isCertifiedDroneOperator = useTypedSelector(
    state => state.common.isCertifiedDroneUser,
  );

  const initialState: OtherDetailsFormData = {
    // for drone operators
    notify_for_projects_within_km:
      userProfile?.notify_for_projects_within_km || null,
    experience_years: userProfile?.experience_years || null,
    certified_drone_operator: userProfile?.certified_drone_operator || false,
    drone_you_own: userProfile?.drone_you_own || null,
    certificate_file:
      userProfile?.certificate_file || userProfile?.certificate_url || null,
    registration_file:
      userProfile?.registration_file ||
      userProfile?.registration_certificate_url ||
      null,
  };
  const queryClient = useQueryClient();

  const { register, handleSubmit, setValue, control, formState, getValues } =
    useForm({
      defaultValues: initialState,
    });

  const { mutate: updateOtherDetails, isPending } = useMutation<
    AxiosResponse,
    AxiosError,
    { userId: number | string; data: Record<string, unknown> },
    unknown
  >({
    mutationFn: payloadDataObject => patchUserProfile(payloadDataObject),
    onSuccess: async response => {
      const results = (response.data as { results?: Record<string, unknown> })
        ?.results;
      const values = getValues();
      const urlsToUpload: string[] = [];
      const assetsToUpload: unknown[] = [];
      const certificateFile = values?.certificate_file as
        | { file?: unknown }[]
        | undefined;
      const registrationFile = values?.registration_file as
        | { file?: unknown }[]
        | undefined;
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

      queryClient.invalidateQueries({ queryKey: ['user-profile'] });

      toast.success(m.profile_details_updated_success());
    },
    onError: err => {
      // eslint-disable-next-line no-console
      console.log(err);
      const detail = (err.response?.data as { detail?: string })?.detail;
      toast.error(detail || m.profile_something_went_wrong());
    },
  });

  useEffect(() => {
    dispatch(
      setCommonState({
        isCertifiedDroneUser: userProfile?.certified_drone_operator
          ? 'yes'
          : 'no',
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSubmit = (formData: OtherDetailsFormData) => {
    const certificateFile = formData?.certificate_file as
      | { file?: { name?: string } }[]
      | undefined;
    const registrationFile = formData?.registration_file as
      | { file?: { name?: string } }[]
      | undefined;
    updateOtherDetails({
      userId: userProfile?.id,
      data: {
        ...formData,
        certificate_file: certificateFile?.[0]?.file?.name,
        registration_file: registrationFile?.[0]?.file?.name,
      },
    });
  };

  return (
    <section className="naxatw-max-h-full naxatw-w-full naxatw-overflow-y-auto naxatw-px-14">
      <Flex>
        <p className="naxatw-mb-2 naxatw-text-lg naxatw-font-bold">
          {m.profile_other_details()}
        </p>
      </Flex>
      <FlexColumn gap={5}>
        <FormControl>
          <Label required>{m.profile_notify_distance_label()}</Label>
          <Input
            placeholder={m.profile_notify_distance_placeholder()}
            className="naxatw-mt-1"
            type="number"
            {...register('notify_for_projects_within_km', {
              required: m.profile_required(),
              valueAsNumber: true,
            })}
          />
          <ErrorMessage
            message={
              formState?.errors?.notify_for_projects_within_km
                ?.message as string
            }
          />
        </FormControl>
        <FormControl>
          <Label required>{m.profile_experience_label()}</Label>
          <Input
            placeholder={m.profile_experience_placeholder()}
            className="naxatw-mt-1"
            type="number"
            {...register('experience_years', {
              required: m.profile_required(),
              valueAsNumber: true,
            })}
          />
          <ErrorMessage
            message={formState.errors?.experience_years?.message as string}
          />
        </FormControl>
        <FormControl>
          <Label required>{m.profile_drone_you_own_label()}</Label>
          <Input
            placeholder={m.profile_drone_you_own_placeholder()}
            className="naxatw-mt-1"
            {...register('drone_you_own', {
              required: m.profile_required(),
            })}
          />
          <ErrorMessage
            message={formState.errors?.drone_you_own?.message as string}
          />
        </FormControl>
        <FormControl>
          <RadioButton
            topic={m.profile_certified_drone_operator()}
            options={droneOperatorOptions}
            direction="column"
            onChangeData={val => {
              dispatch(setCommonState({ isCertifiedDroneUser: val }));
              setValue('certified_drone_operator', val === 'yes');
            }}
            value={isCertifiedDroneOperator}
          />
          <ErrorMessage
            message={
              formState.errors?.certified_drone_operator?.message as string
            }
          />
          {isCertifiedDroneOperator === 'yes' && (
            <Controller
              control={control}
              name="certificate_file"
              rules={{
                required: m.profile_certificate_file_required(),
              }}
              render={({ field: { value }, fieldState: { error } }) => {
                return (
                  <>
                    <FileUpload
                      // @ts-expect-error register is stubbed as a no-op here, not react-hook-form's actual RegisterOptions-returning function
                      register={() => {}}
                      // @ts-expect-error register is stubbed as a no-op here, not react-hook-form's actual RegisterOptions-returning function
                      setValue={setValue}
                      name="certificate_file"
                      // @ts-expect-error data prop is typed as [] on FileUpload, but this field's real value is a URL string or an UploadedFilesType array
                      data={value}
                      onChange={() => {}}
                      fileAccept=".pdf, .jpeg, .png"
                      placeholder={m.profile_file_formats_placeholder()}
                    />
                    <ErrorMessage message={error?.message as string} />
                  </>
                );
              }}
            />
          )}
        </FormControl>
        <FormControl className="naxatw-flex-col naxatw-gap-1">
          <Label>{m.profile_drone_registration_certificate()}</Label>
          <Controller
            control={control}
            name="registration_file"
            render={({ field: { value } }) => {
              // console.log(value, 'value12');
              return (
                <FileUpload
                  // @ts-expect-error register is stubbed as a no-op here, not react-hook-form's actual RegisterOptions-returning function
                  register={() => {}}
                  // @ts-expect-error register is stubbed as a no-op here, not react-hook-form's actual RegisterOptions-returning function
                  setValue={setValue}
                  name="registration_file"
                  // @ts-expect-error data prop is typed as [] on FileUpload, but this field's real value is a URL string or an UploadedFilesType array
                  data={value}
                  onChange={() => {}}
                  fileAccept=".pdf, .jpeg, .png"
                  placeholder={m.profile_file_formats_placeholder()}
                />
              );
            }}
          />
        </FormControl>
      </FlexColumn>
      <div className="naxatw-flex naxatw-justify-center naxatw-py-4">
        <Button
          className="naxatw-bg-red"
          onClick={e => {
            e.preventDefault();
            handleSubmit(onSubmit)();
          }}
          withLoader
          isLoading={isPending}
        >
          {m.profile_save()}
        </Button>
      </div>
    </section>
  );
};

export default OtherDetails;
