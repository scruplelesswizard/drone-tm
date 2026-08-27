import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { useMutation } from '@tanstack/react-query';
import { AxiosError, AxiosResponse } from 'axios';
import { toast } from 'react-toastify';

import Image from '@Components/RadixComponents/Image';
import { Input, Label, FormControl } from '@Components/common/FormUI';
import { Button } from '@Components/RadixComponents/Button';
import Icon from '@Components/common/Icon';
import ErrorMessage from '@Components/common/ErrorMessage';
import { Flex, FlexRow } from '@Components/common/Layouts';
import Person from '@Assets/images/person.svg';
import { useTypedDispatch } from '@Store/hooks';
import { signUpUser } from '@Services/common';
import { setUserState } from '@UserModule/store/actions/user';
import { getRuntimeConfig } from '@/runtimeConfig';
import { m } from '@/paraglide/messages';

const API_URL = getRuntimeConfig('VITE_API_URL', '/api/v1');

const initialState = {
  name: '',
  email_address: '',
  password: '',
  confirmPassword: '',
};

type SignUpFormValues = typeof initialState;

interface ProblemDetail {
  detail?: string;
  errors?: { msg?: string }[];
}

export default function SignUp() {
  const navigate = useNavigate();
  const dispatch = useTypedDispatch();
  const [showPassword, setShowPassword] = useState<boolean>(false);

  const { mutate, isPending, error } = useMutation<
    AxiosResponse,
    AxiosError,
    Parameters<typeof signUpUser>[0],
    unknown
  >({
    mutationFn: signUpUser,
    onSuccess: async res => {
      dispatch(setUserState({ user: res.data }));
      localStorage.setItem('token', res.data.access_token);
      localStorage.setItem('refresh', res.data.refresh_token);
      // New accounts are always PROJECT_CREATOR at this point (see the
      // /register route docstring) and always lack a profile, so send
      // them straight into the same /complete-profile flow a first-time
      // Google/Hanko login uses - that's what grants both roles.
      localStorage.setItem('signedInAs', 'PROJECT_CREATOR');
      toast.success(m.auth_signup_success());
      const userDetailsUrl = `${API_URL}/users/my-info`;
      const response = await fetch(userDetailsUrl, {
        credentials: 'include',
        headers: { 'access-token': res.data.access_token },
      });
      const userDetails = await response.json();
      localStorage.setItem('userprofile', JSON.stringify(userDetails));

      void navigate('/complete-profile');
    },
    onError: err => {
      const data = err.response?.data as ProblemDetail | undefined;
      toast.error(
        data?.detail && typeof data.detail === 'string'
          ? data.detail
          : m.auth_signup_failed_generic(),
      );
    },
  });

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors: formErrors },
  } = useForm<SignUpFormValues>({
    defaultValues: initialState,
  });

  const password = watch('password');

  const onSubmit = (data: SignUpFormValues) =>
    mutate({
      name: data.name,
      email_address: data.email_address,
      password: data.password,
    });

  const problemDetail = error?.response?.data as ProblemDetail | undefined;
  const serverErrorMessage =
    problemDetail?.errors?.[0]?.msg ||
    (typeof problemDetail?.detail === 'string' ? problemDetail.detail : '');

  return (
    <Flex
      gap={5}
      className="naxatw-h-screen naxatw-w-full naxatw-flex-col naxatw-items-center naxatw-justify-center"
    >
      <Image src={Person} />
      <h3>{m.auth_signup_heading()}</h3>

      <form
        onSubmit={handleSubmit(onSubmit)}
        className="naxatw-flex naxatw-w-[60%] naxatw-flex-col naxatw-gap-5"
      >
        <FormControl>
          <Label htmlFor="name" required>
            {m.auth_name_label()}
          </Label>
          <Input
            id="name"
            type="text"
            placeholder={m.auth_name_placeholder()}
            className="naxatw-mt-1 !naxatw-rounded-lg !naxatw-border-grey-400 !naxatw-p-3"
            {...register('name', { required: true })}
          />
        </FormControl>

        <FormControl>
          <Label htmlFor="email_address" required>
            {m.auth_email_label()}
          </Label>
          <Input
            id="email_address"
            type="email"
            placeholder={m.auth_email_placeholder()}
            className="naxatw-mt-1 !naxatw-rounded-lg !naxatw-border-grey-400 !naxatw-p-3"
            {...register('email_address', { required: true })}
          />
        </FormControl>

        <FormControl className="naxatw-relative">
          <Label htmlFor="password" required>
            {m.auth_password_label()}
          </Label>
          <Input
            id="password"
            placeholder={m.auth_password_placeholder()}
            className="naxatw-mt-1 !naxatw-rounded-lg !naxatw-border-grey-400 !naxatw-p-3"
            type={showPassword ? 'text' : 'password'}
            {...register('password', { required: true, minLength: 8 })}
          />
          <Icon
            name={showPassword ? 'visibility' : 'visibility_off'}
            className="naxatw-absolute naxatw-right-2 naxatw-top-[55%] naxatw-cursor-pointer naxatw-text-sm naxatw-text-grey-600"
            onClick={() => setShowPassword(prev => !prev)}
          />
        </FormControl>

        <FormControl>
          <Label htmlFor="confirmPassword" required>
            {m.auth_confirm_password_label()}
          </Label>
          <Input
            id="confirmPassword"
            placeholder={m.auth_confirm_password_placeholder()}
            className="naxatw-mt-1 !naxatw-rounded-lg !naxatw-border-grey-400 !naxatw-p-3"
            type={showPassword ? 'text' : 'password'}
            {...register('confirmPassword', {
              required: true,
              validate: value =>
                value === password || m.auth_confirm_password_mismatch(),
            })}
          />
          <ErrorMessage message={formErrors.confirmPassword?.message} />
        </FormControl>

        <ErrorMessage message={serverErrorMessage} />

        <Button
          className="!naxatw-bg-red naxatw-py-5"
          type="submit"
          isLoading={isPending}
          withLoader
        >
          {m.auth_sign_up()}
        </Button>
        <FlexRow
          className="naxatw-w-full naxatw-items-center naxatw-justify-center"
          gap={2}
        >
          <span>{m.auth_have_account_question()}</span>
          <Button
            variant="ghost"
            className="naxatw-text-body-btn !naxatw-text-red"
            onClick={() => navigate('/login')}
            type="button"
          >
            {m.auth_sign_in_link()}
          </Button>
        </FlexRow>
      </form>
    </Flex>
  );
}
