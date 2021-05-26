import jwtMiddleware from 'express-jwt';
import jwksRsa from 'jwks-rsa';
import bodyParser from 'body-parser';

import { Express, Request, Response } from 'express';
import OIDCClient from './oidc';
import { UserToken } from './types';

const getTokenFromHeader = (req: any): string | undefined => {
  const bearerPrefixLen = 'bearer '.length;
  const token = req.headers.authorization;

  if (!token || token.length < bearerPrefixLen) {
    return undefined;
  }

  return token.substr(bearerPrefixLen);
};

export default (app: Express, oidc: OIDCClient, bitriseUrl: string) => {

  const issuer = `${bitriseUrl}/auth/realms/addons`;

  const verifyJWT = jwtMiddleware({
    algorithms: ["RS256"],
    issuer,
    secret: jwksRsa.expressJwtSecret({
      cache: true,
      rateLimit: true,
      jwksRequestsPerMinute: 5,
      jwksUri: `${issuer}/protocol/openid-connect/certs`
    }),
  });

  const constructRedirectUrl = (req: Request): string => `${req.protocol}://${req.get('host')}/login`;

  const verifyBitriseSession = (req: Request, res: Response, next) => {
    const token = req.cookies.token || '';

    if (!token) {
      const bitriseLoginUrl = oidc.constructBitriseLoginUrl(constructRedirectUrl(req));
      return res.redirect(bitriseLoginUrl);
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


  app.get('/login', async (req: Request, res) => {
    let userToken: UserToken = null;

    try {
      userToken = await oidc.authorizationCodeGrant(req.query.code as string, constructRedirectUrl(req));
    } catch(error) {
      console.log(error.response.data);

      return res.status(error.response.status)
        .send("Unauthorized. You need to log-in first. Visit https://app.bitrise.io/users/sign_in")
        .end();
    }

    res.cookie('token', userToken.accessToken, {
      signed: false,
      maxAge: 60 * 60 * 1000 // 1 hour
    });

    res.redirect('/me');
  });

  // Delete endpoint -> user removed this addon from a particular app
  app.delete('/provision/:app_slug', bodyParser.json(), verifyJWT, (req, res) => {
    res.send(`Clearing any ${req.params.app_slug} data...`).status(200).end();
  });

  return verifyBitriseSession;
};