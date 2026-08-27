import axios from 'axios';
import { api, authenticated } from '.';

const OSM_NOMINATIM_URL = 'https://nominatim.openstreetmap.org';

export const signInUser = (data: {
  username: string;
  password: string;
  role?: string;
}) => api.post('/users/login', data);

export const signUpUser = (data: {
  email_address: string;
  password: string;
  name: string;
}) =>
  // /users/register takes a JSON body (unlike /users/login's OAuth2 form
  // data), so it needs an explicit Content-Type - the `api` instance
  // defaults to multipart/form-data for the form-based endpoints.
  api.post('/users/register', data, {
    headers: { 'Content-Type': 'application/json' },
  });

export const signInGoogle = () => api.get('/users/google-login');

export const signInCallBackUrl = () => api.get('/users/callback');

export const logoutUser = () => api.post('/user/logout/');

export const forgotPassword = (data: { email: string }) =>
  api.post('/users/forgot-password', data);

export const postUserProfile = ({
  userId,
  data,
}: {
  userId: number;
  data: Record<string, unknown>;
}) =>
  authenticated(api).post(`/users/${userId}/profile`, data, {
    headers: { 'Content-Type': 'application/json' },
  });

export const getUserProfileInfo = () =>
  authenticated(api).get('/users/my-info');

export const getMentionableUsers = () =>
  authenticated(api).get('/users/mentionable');

export const patchUserProfile = ({
  userId,
  data,
}: {
  userId: number | string;
  data: Record<string, unknown>;
}) =>
  authenticated(api).patch(`/users/${userId}/profile`, data, {
    headers: { 'Content-Type': 'application/json' },
  });

export const getCountry = (params: {
  lat: number;
  lon: number;
  format: string;
}) => axios.get(`${OSM_NOMINATIM_URL}/reverse`, { params });
