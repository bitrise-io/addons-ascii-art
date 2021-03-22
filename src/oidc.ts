import axios, { AxiosInstance } from 'axios';
import { Tokens } from './types';

export default class {
  private tokenUrl: string;

  private clientID: string;
  private clientSecret: string;

  constructor(tokenBaseURL: string, clientID: string, clientSecret: string) {
    this.tokenUrl = `${tokenBaseURL}/auth/realms/addons/protocol/openid-connect/token`;
    this.clientID = clientID;
    this.clientSecret = clientSecret;
  }

  public exchangeToken = async (token: string): Promise<Tokens> => {
    const params = new URLSearchParams({
      'grant_type': 'urn:ietf:params:oauth:grant-type:token-exchange',
      'client_id': this.clientID,
      'client_secret': this.clientSecret,
      'subject_token': token,
      'requested_token_type': 'urn:ietf:params:oauth:token-type:refresh_token'
    });

    const config = {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    };

    const response = await axios.post(this.tokenUrl, params, config);

    const accessToken = response.data.access_token;
    const refreshToken = response.data.refresh_token;

    return { accessToken, refreshToken };
  };

  public refreshAccessToken = async(refreshToken: string): Promise<Tokens> => {
    const params = new URLSearchParams({
      'grant_type': 'refresh_token',
      'client_id': this.clientID,
      'refresh_token': refreshToken,
    });

    const config = {
      headers: {'Content-Type': 'application/x-www-form-urlencoded'}
    };

    const response = await axios.post(this.tokenUrl, params, config);

    const accessToken = response.data.access_token;
    refreshToken = response.data.refresh_token;

    return { accessToken, refreshToken };
  }
}
