import axios from 'axios';
import { Tokens } from './types';

import TokenStore from './token_store';

export default class {
  private tokenUrl: string;

  private clientID: string;
  private clientSecret: string;

  private tokenStore: TokenStore;

  constructor(tokenBaseURL: string, clientID: string, clientSecret: string, tokenStore: TokenStore) {
    this.tokenUrl = `${tokenBaseURL}/auth/realms/addons/protocol/openid-connect/token`;
    this.clientID = clientID;
    this.clientSecret = clientSecret;
    this.tokenStore = tokenStore;
  }

  public exchangeToken = async (appSlug: string, token: string): Promise<Tokens> => {
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

    this.tokenStore.storeTokensInRedis(appSlug, { accessToken: accessToken, refreshToken: refreshToken })

    return { accessToken, refreshToken };
  };

  public refreshAccessToken = async(appSlug: string, refreshToken: string): Promise<Tokens> => {
    const params = new URLSearchParams({
      'grant_type': 'refresh_token',
      'client_id': this.clientID,
      'client_secret': this.clientSecret,
      'refresh_token': refreshToken,
    });

    const config = {
      headers: {'Content-Type': 'application/x-www-form-urlencoded'}
    };

    const response = await axios.post(this.tokenUrl, params, config);
    const accessToken = response.data.access_token;
    refreshToken = response.data.refresh_token;

    this.tokenStore.storeTokensInRedis(appSlug, { accessToken: accessToken, refreshToken: refreshToken })

    return { accessToken, refreshToken };
  }
}
