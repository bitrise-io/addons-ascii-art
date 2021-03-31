import express from 'express';
import jwtMiddleware from 'express-jwt';
import jwksRsa from 'jwks-rsa';
import bodyParser from 'body-parser';
import figlet from 'figlet';
import crypto from 'crypto';
import OIDC from './oidc';
import ApiClient from './api_client';
import { Tokens } from './types';

const app = express();
const port = process.env.PORT || 3000;
const clientID = process.env.CLIENT_ID;
const clientSecret = process.env.CLIENT_SECRET;
const ssoSecret = process.env.SSO_SECRET;

const authBaseURL = process.env.TOKEN_BASE_URL || 'https://auth.services.bitrise.io'
let tokens: Tokens = { accessToken: "", refreshToken: "" };

const oidc = new OIDC(authBaseURL, clientID, clientSecret);
const apiClient = new ApiClient(tokens, oidc);

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

app.post('/provision', bodyParser.json(), verifyJWT, async (req, res) => {
  const token = getTokenFromHeader(req)

  try {
    const result = await oidc.exchangeToken(token);
    tokens.accessToken = result.accessToken;
    tokens.refreshToken = result.refreshToken;

    res.send(`Addon provisioned for ${req.body.app_slug}`).status(200).end();
  } catch(error) {
    if (error.response) {
      return res.status(error.response.status).send(error.response.data).end();
    }
    res.status(400).end();
  }
});

// -

app.post('/login', bodyParser.urlencoded({ extended: true }), verifySSOSecret, (req, res) => {
  res.send(`Hi ${req.body.app_slug}!`).end()
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
