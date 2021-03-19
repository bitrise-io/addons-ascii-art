import axios, { AxiosInstance } from 'axios';

export default class OIDC {
  private storage = {};
  private tokenBaseURL: string;

  constructor(tokenBaseURL: string, storage: {}) {
    this.storage = storage;
    this.tokenBaseURL = tokenBaseURL;
  }

  public axiosClient = (appSlug: string, clientID: string): AxiosInstance => {
    const parent = this;
    
    const axiosApiInstance = axios.create();
    axiosApiInstance.interceptors.request.use(
      async config => {
        config.headers['Authorization'] = `Bearer ` + parent.storage[appSlug].accessToken;
        return config;
      },
      error => {
        Promise.reject(error)
      });

    axiosApiInstance.interceptors.response.use((response) => {
      return response
    }, async function (error) {
      const originalRequest = error.config;

      if (error.response && error.response.status === 403 && !originalRequest._retry) {
        originalRequest._retry = true;
        const access_token = parent.refreshAccessToken(appSlug, clientID);
        originalRequest.headers['Authorization'] = 'Bearer ' + access_token;
        return axiosApiInstance(originalRequest);
      }
      
      return Promise.reject(error);
    });

    return axiosApiInstance;
  }

  private refreshAccessToken = async(appSlug: string, clientID: string): Promise<string> => {
    const params = new URLSearchParams({
      'grant_type': 'refresh_token',
      'client_id': clientID,
      'refresh_token': this.storage[appSlug].refreshToken,
    });

    const config = {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    }

    const response = await axios.post(this.tokenBaseURL + '/auth/realms/addons/protocol/openid-connect/token', params, config)

      const accessToken = response.data.access_token;
      const refreshToken = response.data.refresh_token;

      this.storage[appSlug] = {
        accessToken: accessToken,
        refreshToken: refreshToken,
      }

      return accessToken
  }
}
