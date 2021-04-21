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
const redisUrl = process.env.REDIS_URL;
const hashAlgorithm = process.env.HASH || 'sha-256';
const authBaseURL = process.env.TOKEN_BASE_URL || 'https://auth.services.bitrise.io';

const redisClient = redis.createClient(redisUrl);
const tokenStore = new TokenStore(redisClient);
const oidc = new OIDC(authBaseURL, clientID, clientSecret, tokenStore);
const apiClient = new ApiClient(oidc, tokenStore);

const cookieParser = require("cookie-parser");
app.use(cookieParser());

//
// Routes

// Testing route not used by Bitrise system
app.get('/', (_, res) => {
  const tempToken = "eyJhbGciOiJSUzI1NiIsInR5cCIgOiAiSldUIiwia2lkIiA6ICJmOG9jbkVNMmU3M3B4cHVoYzc5WF9hZTJnN19xdTA5WTF1dEVQbWNjdDdJIn0.eyJleHAiOjE2MTg5MjY2MjAsImlhdCI6MTYxODkxOTQyMCwianRpIjoiZWY2NzY3NzAtZWM1MC00ZjUzLWI5OGQtZDhjM2RlNGMyMjkyIiwiaXNzIjoiaHR0cHM6Ly9hdXRoLnNlcnZpY2VzLmJpdHJpc2UuaW8vYXV0aC9yZWFsbXMvYWRkb25zIiwiYXVkIjoiYml0cmlzZS1hcGkiLCJzdWIiOiIzZDFlYmMxNi01N2ExLTQ1ZmUtOTg5Zi02YWEwYWE2NWVkNDIiLCJ0eXAiOiJCZWFyZXIiLCJhenAiOiJiaXRyaXNlIiwic2Vzc2lvbl9zdGF0ZSI6IjM1Y2M0ZWRmLTBmNDUtNGY0Ni1hYmMxLTMwMzQwNWQyMzdiMiIsImFjciI6IjEiLCJzY29wZSI6IiIsInVzZXJfaWQiOiIzNDcyODVmZjMyZWVkMTU4In0.XegCcqSqFhF5HxCx25DAv3TsIlonHEVoY9xsTb2rEXF4KaIyZpAc06nujddZTk24wmRTzZJRDpT4-XgrR_IzLZ-gU_S06ALX7-u8Vfq69PjUjxCie9LFjZ4eM-MEy5sUzR6gRqGtnXGvKbeXoegoOr_abiC0cgkooI1q-nwfuh0tD7U8rDzfGgs5Yxesg5ktcaqvDN3qTjvTNtCa6tsFjimlup-G-TPdkkqOxds4ShCed5hQd5rIKoiN7FkwnPlCgh63SUDHbaJ50uEN9CrKjJchdtTT1vsTpdFXiDmx4vLDqET4yfX0ljSuLP_MQLsoLRLlntf_7w8-zZ8_8e4qKQ"
  
  const cookieConfig = {
    //secure: true, // to force https (if you use it)
    signed: false // if you use the secret with cookieParser
  };
  
  res.cookie('token', tempToken, cookieConfig);
  res.send("hello")
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
    const appSlug = req.body.app_slug

    // exchange the received token for background processing token when needed
    await oidc.exchangeToken(appSlug, token);

    // do any initialization logic here for individual application

    // response with 200
    res.send(`Addon provisioned for ${appSlug}`).status(200).end();
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

  console.log("logging in")
  console.log(req.body)
    
  if (userToken) {
    console.log("user flow")
    console.log(userToken)
    const cookieConfig = {
      signed: false
    };
    res.cookie('token', userToken, cookieConfig);
  }

  figlet(`Hi from ${data['data'].title}`, (err, text: string) => {
    if (err) {
      return res.status(500).end();
    }
    
    res.end(`<pre>${text.replace(/\n/g, '<br />')}</pre>`);
  });
});

app.get('/me', async(req, res) => {
  const token = req.cookies.token || '';

  console.log("ME")
  console.log(req.cookies.token)
  console.log("signed")
  console.log(req.signedCookies)
  
  if (!token) {
    return res.status(401).send();
  }

  const { data } = await apiClient.getMe(token);

  if (!data) {
    return res.send("Error").end();
  }
  res.send(data).end();
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
