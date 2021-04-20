import axios from 'axios';
import { Tokens } from './types';
import OIDC from './oidc';
import TokenStore from './token_store';

const apiBaseURL = process.env.API_BASE_URL || 'https://api.bitrise.io/v0.2'

export default class {
  private axiosApiInstance: any;
  private tokenStore: TokenStore;

  constructor(oidc: OIDC, tokenStore: TokenStore) {
    this.axiosApiInstance = axios.create();
    this.tokenStore = tokenStore;

    this.axiosApiInstance.interceptors.request.use(
      async config => {
        let tokens = await this.tokenStore.retrieveTokensFromStore();

        config.headers['Authorization'] = `Bearer ${tokens.accessToken}`;
        return config;
      },
      error => Promise.reject(error));

    this.axiosApiInstance.interceptors.response.use(response => {
        return response
      }, async function (error) {
        const originalRequest = error.config;

        if (error.response && error.response.status === 401 && !originalRequest._retry) {
          originalRequest._retry = true;

          let tokens = await tokenStore.retrieveTokensFromStore();

          const { refreshToken, accessToken } = await oidc.refreshAccessToken(tokens.refreshToken);

          originalRequest.headers['Authorization'] = `Bearer ${accessToken}`;
          return axios.request(originalRequest);
        }

        return Promise.reject(error);
      });
    }

    public getApp = async (appSlug: string) => await this.axiosApiInstance.get(`${apiBaseURL}/apps/${appSlug}`);
    
    public getMe = async (userToken: string) => {
      const instance = axios.create();

      const config = {
        headers: {
          Authorization: `Bearer ${userToken}`,
        }
      }

      return await instance.get(`${apiBaseURL}/me`, config);
    }
  };