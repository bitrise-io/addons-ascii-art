import express from 'express';
import jwtMiddleware from 'express-jwt';
import jwksRsa from 'jwks-rsa';
import bodyParser from 'body-parser';
import figlet from 'figlet';
import crypto from 'crypto';
import OIDC from './oidc';
import ApiClient from './api_client';
import TokenStore from './token_store';
import redis from 'redis';
import { UserToken } from './types';

const app = express();
const port = process.env.PORT || 3000;
const clientID = process.env.CLIENT_ID;
const clientSecret = process.env.CLIENT_SECRET;
const ssoSecret = process.env.SSO_SECRET;
const redisUrl = process.env.REDIS_URL;
const hashAlgorithm = process.env.HASH || 'sha-256';
const authBaseURL = process.env.TOKEN_BASE_URL || 'https://auth.services.bitrise.io';
const realm = process.env.REALM || 'master';

const redisClient = redis.createClient(redisUrl);
const tokenStore = new TokenStore(redisClient);
const oidc = new OIDC(authBaseURL, realm, clientID, clientSecret, tokenStore);
const apiClient = new ApiClient(oidc, tokenStore);

const cookieParser = require("cookie-parser");
app.use(cookieParser());

//
// Routes

// Testing route not used by Bitrise system
app.get('/', (_, res) => {
  res.send('Welcome to ASCII art').end();
});

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
  const appSlug = req.body.app_slug
  const { data } = await apiClient.getApp(appSlug);
  const userToken =  req.body.user_token

  if (userToken) {
    res.cookie('token', userToken, { signed: false });
  }

  figlet(`Hi from ${data['data'].title}`, (err, text: string) => {
    if (err) {
      return res.status(500).end();
    }

    res.end(`<pre>${text.replace(/\n/g, '<br />')}</pre>`);
  });
});

app.get('/login-auth-code', async (req, res) => {
  let userToken: UserToken = null;
  const fullUrl = `${req.protocol}://${req.get('host')}/login-auth-code`;

  try {
    userToken = await oidc.authorizationGrant(req.query.code as string, fullUrl);
  } catch(error) {
    console.log(error.response);
    return res.status(error.response.status).send(error.response.data).end();
  }

  res.cookie('token', userToken.accessToken, { signed: false });
  res.redirect('/me');
});

app.get('/me', async(req, res) => {
  const token = req.cookies.token || '';

  if (!token) {
    return res.status(401).send();
  }

  try {
    const { data } = await apiClient.getMe(token);
    res.send(data).end();
  } catch(error) {
    console.log(error.response);
    return res.status(error.response.status).send(`token: ${token} ${error.response}`).end();
  }
});

// Delete endpoint -> user removed this addon from a particular app
app.delete('/provision/:app_slug', bodyParser.json(), verifyJWT, (req, res) => {
  res.send(`Clearing any ${req.params.app_slug} data...`).status(200).end();
});

//
// main

app.listen(port, () => {
  return console.log(`server is listening on ${port}`);
});

const getTokenFromHeader = (req: any): string | undefined => {
  const bearerPrefixLen = 'bearer '.length
  const token = req.headers.authorization

  if (!token || token.length < bearerPrefixLen) {
    return undefined;
  }

  return token.substr(bearerPrefixLen);
}
