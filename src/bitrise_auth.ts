import jwtMiddleware from 'express-jwt';
import jwksRsa from 'jwks-rsa';
import bodyParser from 'body-parser';
import crypto from 'crypto';

import { Express } from 'express';
import OIDCClient from './oidc';
import { UserToken } from './types';

const getTokenFromHeader = (req: any): string | undefined => {
  const bearerPrefixLen = 'bearer '.length
  const token = req.headers.authorization

  if (!token || token.length < bearerPrefixLen) {
    return undefined;
  }

  return token.substr(bearerPrefixLen);
};

export default (app: Express, oidc: OIDCClient, authBaseURL: String) => {
  const hashAlgorithm = process.env.HASH || 'sha-256';
  const ssoSecret = process.env.SSO_SECRET;

  const verifyJWT = jwtMiddleware({
    algorithms: ["RS256"],
    issuer: `${authBaseURL}/auth/realms/addons`,
    secret: jwksRsa.expressJwtSecret({
      cache: true,
      rateLimit: true,
      jwksRequestsPerMinute: 5,
      jwksUri: `${authBaseURL}/auth/realms/addons/protocol/openid-connect/certs`
    }),
  });

  const verifySSOSecret = (req, res, next) => {
    const { timestamp, app_slug, token } = req.body;

    const hash = crypto.createHash(hashAlgorithm);
    hash.update(`${app_slug}:${ssoSecret}:${timestamp}`);

    if (hash.digest('hex') !== token) {
      return res.status(401).end();
    }

    next();
  };

  // Provisioner endpoint -> user added this addon for a perticular app
  app.post('/provision', bodyParser.json({ type(req) { return true; }}), verifyJWT, async (req, res) => {
    const token = getTokenFromHeader(req)

    try {
      // exchange the received token for background processing token when needed
      await oidc.exchangeToken(token);

      // do any initialization logic here for individual application

      // response with 200
      res.send(`Addon provisioned for ${req.body.app_slug}`).status(200).end();
    } catch(error) {
      if (error.response) {
        return res.status(error.response.status).send(error.response.data).end();
      }

      // in case of error during addon provisioning it would be retried later with exponential backoff
      res.status(400).end();
    }
  });

  // SSO login endpoint -> user opened this addon via bitrise console
  // NOTE: this implementation is subject to change in the future
  app.post('/login', bodyParser.urlencoded({ extended: true }), verifySSOSecret, async(req, res) => {
    const userToken =  req.body.user_token

    if (userToken) {
      res.cookie('token', userToken, { signed: false });
      res.redirect('/me');
    } else {
      res.status(401);
      res.end("Unauthorized. You need to log-in first. Visit https://app.bitrise.io/users/sign_in");
    }
  });

  // #ALPHA: authorization code support for user login
  app.get('/login-auth-code', async (req, res) => {
    let userToken: UserToken = null;
    const fullUrl = `${req.protocol}://${req.get('host')}/login-auth-code`;

    try {
      userToken = await oidc.authorizationCodeGrant(req.query.code as string, fullUrl);
    } catch(error) {
      console.log(error.response);
      return res.status(error.response.status).send(error.response.data).end();
    }

    res.cookie('token', userToken.accessToken, { signed: false });
    res.redirect('/me');
  });

  // Delete endpoint -> user removed this addon from a particular app
  app.delete('/provision/:app_slug', bodyParser.json(), verifyJWT, (req, res) => {
    res.send(`Clearing any ${req.params.app_slug} data...`).status(200).end();
  });
};