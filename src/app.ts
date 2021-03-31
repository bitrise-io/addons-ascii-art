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

const app = express();
const port = process.env.PORT || 3000;
const clientID = process.env.CLIENT_ID;
const clientSecret = process.env.CLIENT_SECRET;
const ssoSecret = process.env.SSO_SECRET;
const redisUrl  = process.env.REDIS_URL;

const authBaseURL = process.env.TOKEN_BASE_URL || 'https://auth.services.bitrise.io'

const redisClient = redis.createClient(redisUrl);
const tokenStore = new TokenStore(redisClient)
const oidc = new OIDC(authBaseURL, clientID, clientSecret, tokenStore);

//
// Routes

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

  const hash = crypto.createHash('sha1');
  hash.update(`${app_slug}:${ssoSecret}:${timestamp}`);
  
  if (hash.digest('hex') !== token) {
    return res.status(401).end();
  }
  
  next();
};

// -

app.post('/provision', bodyParser.json({
  type(req) {
    return true;
  }
}), async (req, res) => {
  const token = getTokenFromHeader(req)

  try {
    console.log("provisioning ###")
    console.log(req.body.app_slug)
    console.log(req.body)
    const appSlug = req.body.app_slug

    await oidc.exchangeToken(appSlug, token);

    res.send(`Addon provisioned for ${appSlug}`).status(200).end();
  } catch(error) {
    if (error.response) {
      return res.status(error.response.status).send(error.response.data).end();
    }
    res.status(400).end();
  }
});

// -

app.post('/login', bodyParser.urlencoded({ extended: true }), verifySSOSecret, async(req, res) => {
  console.log("ide")
  const appSlug = req.body.app_slug

  console.log(appSlug)

  const apiClient = new ApiClient(appSlug, oidc, tokenStore);

  const { data } = await apiClient.getApp();
  console.log("ide3")
  figlet(`Hi from ${data['data'].title}`, (err, data) => res.send(data || '').status(err ? 500 : 200).end());
});

// -

app.delete('/provision/:app_slug', bodyParser.json(), verifyJWT, (req, res) => {
  res.send(`Clearing any ${req.params.app_slug} data...`).status(200).end();
});

//
// main

app.listen(port, () => {
  return console.log(`server is listening on ${port}`);
});

let getTokenFromHeader = (req: any): string | undefined => {
  const bearerPrefixLen = 'bearer '.length
  let token = req.headers.authorization

  if (!token || token.length < bearerPrefixLen) {
    return undefined;
  }

  return token.substr(bearerPrefixLen);
}
