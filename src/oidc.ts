import axios from 'axios';
import { UserToken } from './types';

import TokenStore from './token_store';

class OIDCClient {
  private tokenUrl: string;

  private clientID: string;
  private clientSecret: string;
  private bitriseBaseUrl: string;
  private bitriseRealm: string;

  private tokenStore: TokenStore;

  constructor(tokenBaseURL: string, realm: string, clientID: string, clientSecret: string, tokenStore: TokenStore) {
    this.tokenUrl = `${tokenBaseURL}/auth/realms/${realm}/protocol/openid-connect/token`;
    this.bitriseBaseUrl = tokenBaseURL;
    this.bitriseRealm = realm;
    this.clientID = clientID;
    this.clientSecret = clientSecret;
    this.tokenStore = tokenStore;
  }

  public constructBitriseLoginUrl = (redirectUrl: string): string => {
    const params = new URLSearchParams({
      'response_type': 'code',
      'client_id': this.clientID,
      'redirect_uri': redirectUrl,
    });

    return `${this.bitriseBaseUrl}/auth/realms/${this.bitriseRealm}/protocol/openid-connect/auth?${params.toString()}`;
  }

  public clientCredentials = async (): Promise<string> => {
    const params = new URLSearchParams({
      'grant_type': 'client_credentials',
      'client_id': this.clientID,
      'client_secret': this.clientSecret,
    });

    const config = {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    };

    const response = await axios.post(this.tokenUrl, params, config);

    const accessToken = response.data.access_token;
    this.tokenStore.storeTokensInRedis({ accessToken: accessToken });

    return accessToken;
  };

  public authorizationCodeGrant = async (authCode: string, redirectUri: string): Promise<UserToken> => {
    const params = new URLSearchParams({
      'grant_type': 'authorization_code',
      'code': authCode,
      'client_id': this.clientID,
      'client_secret': this.clientSecret,
      'redirect_uri': redirectUri,
    });

    const config = {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    };

    const response = await axios.post(this.tokenUrl, params, config);

    const accessToken = response.data.access_token;
    const refreshToken = response.data.refresh_token;
    const idToken = response.data.id_token;

    return { accessToken, refreshToken, idToken };
  };
};

export default OIDCClient;
