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
  const tempToken = "eyJhbGciOiJSUzI1NiIsInR5cCIgOiAiSldUIiwia2lkIiA6ICJ0dG80NS1qSzBFOURQa2huN2R2TVMzRUhWVXFsVUdoVERLcUJjdDlNNDRVIn0.eyJleHAiOjE2MTg4NDQ4ODgsImlhdCI6MTYxODgzNzY4OCwianRpIjoiMGVkNmNiNmUtOWIxYy00MTgxLWJmNDQtZGFmM2NjZjNkZWQxIiwiaXNzIjoiaHR0cHM6Ly9hdXRoLnNlcnZpY2VzLmJpdHJpc2UuZGV2L2F1dGgvcmVhbG1zL2FkZG9ucyIsImF1ZCI6ImJpdHJpc2UiLCJzdWIiOiI2YTJkM2JhMy03N2UxLTQyYmYtYTk2Yi1jNGQ2ZjY5OWM4ZWMiLCJ0eXAiOiJCZWFyZXIiLCJhenAiOiJiaXRyaXNlIiwic2Vzc2lvbl9zdGF0ZSI6IjQxOTRhNzYzLTRlMTQtNGZjNy1hNWVmLWU1ZTdlYjgzNTE2OSIsImFjciI6IjEiLCJzY29wZSI6IiIsInVzZXJfaWQiOiIzNDcyODVmZjMyZWVkMTU4In0.n600dc2GcPmhBugy595YQUFonQbET_OM4E6gVIqgTem4sYkf0FpLH_VMDVwHW4dTD3z-yygIGQWfZh-XJEveOgn9BfmR-rh9dpgCl6xq8xh2Y9xg-fR54EgHh20l9w4kzBaCi1A-NUOCX1QMW50D9OKq-zstuB5oLswjCWGWdafVOfN-ZmUdW2GUWxUWw6kohmv2ZGFCyPDz5GfOrl2tf8jkKVXuJNfvcxJFMHFP6SH6bjXFdA0rg4Ox2M54PAk2vfmRLUAEOG8l5XDvW26kdm7zU2OHznuTgKSCqdVKYWHny-_Wdgt7vWida2NLVQLtGXid4evrZLdOCNFlJLMNeQ"
  res.writeHead(200, {
    "Set-Cookie": `${tempToken}; HttpsOnly`,
    "Access-Control-Allow-Credentials": "true"
  });

  res.end("hello")
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

  figlet(`Hi from ${data['data'].title}`, (err, text: string) => {
    if (err) {
      return res.status(500).end();
    }
    
    if (userToken) {
      console.log("user flow")
      console.log(userToken)
      res.writeHead(200, {
        "Set-Cookie": `token=${userToken}; HttpsOnly`,
        "Access-Control-Allow-Credentials": "true"
      });
    }
    
    res.end(`<pre>${text.replace(/\n/g, '<br />')}</pre>`);
  });
});

app.get('/me', async(req, res) => {
  const token = req.cookies.token || '';
  
  if (!token) {
    return res.status(401).send();
  }

  const { data } = await apiClient.getMe(token);

  if (!data) {
    return res.send("Error").end();
  }
  res.end(data);
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
