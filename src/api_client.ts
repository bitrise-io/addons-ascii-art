import axios from 'axios';
import { Tokens } from './types';
import OIDC from './oidc';
import TokenStore from './token_store';

const apiBaseURL = process.env.API_BASE_URL || 'https://api.bitrise.io/v0.2'

export default class {
  private axiosApiInstance: any;
  private appSlug: string;

  constructor(appSlug: string, oidc: OIDC, tokenStore: TokenStore) {
    this.axiosApiInstance = axios.create();
    this.appSlug = appSlug;

    this.axiosApiInstance.interceptors.request.use(
      async config => {
        let tokens = await tokenStore.retrieveTokensFromStore(this.appSlug);

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

          let tokens = await tokenStore.retrieveTokensFromStore(this.appSlug)
          const { refreshToken, accessToken } = await oidc.refreshAccessToken(appSlug, tokens.refreshToken);

          originalRequest.headers['Authorization'] = `Bearer ${accessToken}`;
          return this.axiosApiInstance(originalRequest);
        }

        return Promise.reject(error);
      });
    }

    public getApp = () => this.axiosApiInstance.get(`${apiBaseURL}/apps/${this.appSlug}`);
  };