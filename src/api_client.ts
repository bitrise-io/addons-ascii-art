import axios from 'axios';
import { Tokens } from './types';
import OIDC from './oidc';
import TokenStore from './token_store';

const apiBaseURL = process.env.API_BASE_URL || 'https://api.bitrise.io/v0.2'

export default class {
  private axiosApiInstance: any;
  private appSlug: string;
  private tokenStore: TokenStore;

  constructor(appSlug: string, oidc: OIDC, tokenStore: TokenStore) {
    this.axiosApiInstance = axios.create();
    this.appSlug = appSlug;
    this.tokenStore = tokenStore;

    this.axiosApiInstance.interceptors.request.use(
      async config => {
        console.log("####1")

        let tokens = await this.tokenStore.retrieveTokensFromStore(this.appSlug);

        console.log("Ide megy")
        console.log(tokens)
        config.headers['Authorization'] = `Bearer ${tokens.accessToken}`;
        return config;
      },
      error => Promise.reject(error));

    this.axiosApiInstance.interceptors.response.use(response => {
        return response
      }, async function (error) {
        const originalRequest = error.config;
        console.log("Ide before retry $$$$$")
        console.log(error.response.status)

        if (error.response && error.response.status === 401 && !originalRequest._retry) {
          console.log("Ide megy222222")
          originalRequest._retry = true;

          let tokens = await tokenStore.retrieveTokensFromStore(appSlug)
          console.log("retrieved tokens")
          console.log(tokens)

          const { refreshToken, accessToken } = await oidc.refreshAccessToken(appSlug, tokens.refreshToken);
          
          console.log("refreshed")
          console.log(accessToken)
          originalRequest.headers['Authorization'] = `Bearer ${accessToken}`;
          return axios.request(originalRequest);
        }

        return Promise.reject(error);
      });
    }

    public  getApp = () =>  this.axiosApiInstance.get(`${apiBaseURL}/apps/${this.appSlug}`);
  };