import axios from 'axios';
import { Tokens } from './types';
import OIDC from './oidc';

const apiBaseURL = process.env.API_BASE_URL || 'https://api.bitrise.io/v0.2'

export default class {
  private axiosApiInstance: any;

  constructor(tokens: Tokens, oidc: OIDC) {
    this.axiosApiInstance = axios.create();

    this.axiosApiInstance.interceptors.request.use(
      async config => {
        config.headers['Authorization'] = `Bearer ${tokens.accessToken}`;
        return config;
      },
      error => Promise.reject(error));

      this.axiosApiInstance.interceptors.response.use(response => {
        return response
      }, async function (error) {
        const originalRequest = error.config;

        if (error.response && error.response.status === 403 && !originalRequest._retry) {
          originalRequest._retry = true;
          const { refreshToken, accessToken } = await oidc.refreshAccessToken(tokens.refreshToken);

          tokens.accessToken = accessToken;
          tokens.refreshToken = refreshToken;

          originalRequest.headers['Authorization'] = `Bearer ${accessToken}`;
          return this.axiosApiInstance(originalRequest);
        }

        return Promise.reject(error);
      });
    }

    public getApp = (appSlug: string) => this.axiosApiInstance.get(`${apiBaseURL}/apps/${appSlug}`);
  };